//! E-mails that bring people back (ADR 0118): an account that never made an event (the day
//! after, ADR 0122, and once more a week later), an event that stopped before its tickets, a batch
//! left at the checkout (ADR 0122), a door not set up days before the event, and "how did it go?"
//! after it. Each goes once per account (and
//! event), between 9h and 20h in Brasília, only with what the day's quota leaves after codes and
//! announcements, and never to someone who turned them off (`users.reminder_emails`).

use time::{OffsetDateTime, UtcOffset};
use uuid::Uuid;

use crate::emails::{self, ReminderMail};
use crate::error::ApiResult;
use crate::mail::{MailError, MailKind};
use crate::state::AppState;

/// Reminders sent in one hourly run at most: a backlog (accounts from before this) goes out over
/// days, never in a burst.
const PER_RUN: i64 = 20;
/// Hours of the day (Brasília) when reminders go out: nobody gets one at 3 in the morning.
const SEND_HOURS: std::ops::RangeInclusive<u8> = 9..=19;

/// What a reminder is about.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReminderKind {
    /// An account a day old with no event (two days before ADR 0122).
    NoEventFirst,
    /// The same, a week after the first one.
    NoEventSecond,
    /// An event three days old with no tickets generated, the event still ahead.
    EventStalled,
    /// A batch ordered and left unpaid for a day, nothing pending at Stripe, the event still
    /// ahead (ADR 0122).
    UnpaidBatch,
    /// Tickets out, the event within three days and no door link yet.
    DoorSetup,
    /// The event ended (half a day to three days ago) with tickets out.
    AfterEvent,
}

impl ReminderKind {
    const fn db(self) -> &'static str {
        match self {
            Self::NoEventFirst => "no_event_first",
            Self::NoEventSecond => "no_event_second",
            Self::EventStalled => "event_stalled",
            Self::UnpaidBatch => "unpaid_batch",
            Self::DoorSetup => "door_setup",
            Self::AfterEvent => "after_event",
        }
    }
}

/// Someone to remind, and the event when the reminder is about one.
#[derive(Debug, Clone)]
struct Candidate {
    kind: ReminderKind,
    user_id: Uuid,
    email: String,
    event: Option<EventFacts>,
}

#[derive(Debug, Clone)]
struct EventFacts {
    id: Uuid,
    name: String,
    starts_at: OffsetDateTime,
    utc_offset_minutes: i32,
    tokens: bool,
}

/// Whether reminders may go out now (Brasília's working hours).
pub fn sending_hours(now: OffsetDateTime) -> bool {
    let brasilia = UtcOffset::from_hms(-3, 0, 0).unwrap_or(UtcOffset::UTC);
    SEND_HOURS.contains(&now.to_offset(brasilia).hour())
}

/// Sends the reminders due (the worker's hourly tick); how many went out.
///
/// # Errors
///
/// Database errors.
pub async fn run(state: &AppState) -> ApiResult<usize> {
    run_at(state, OffsetDateTime::now_utc()).await
}

/// [`run`] as if it were `now` (the hour decides whether anything goes out).
///
/// # Errors
///
/// Database errors.
pub async fn run_at(state: &AppState, now: OffsetDateTime) -> ApiResult<usize> {
    if !sending_hours(now) {
        return Ok(0);
    }
    // Only the part of the quota announcements may use, minus what is waiting for it.
    let room = match crate::mailings::daily_budget(state) {
        Some(budget) => {
            let (sent, queued) = crate::mailings::quota_now(state).await?;
            (i64::from(budget) - sent - queued).clamp(0, PER_RUN)
        }
        None => PER_RUN,
    };
    if room == 0 {
        return Ok(0);
    }
    let candidates = candidates(state, room).await?;
    let free = crate::pricing::current(&state.pool).await?.free_tickets;
    let mut sent = 0;
    for candidate in candidates {
        // Claimed first: a second run, or a restart, never sends it twice.
        let id = Uuid::new_v4();
        let claimed = sqlx::query!(
            r#"insert into reminder_sends (id, user_id, kind, event_id, status)
               values ($1, $2, $3, $4, 'sent') on conflict do nothing"#,
            id,
            candidate.user_id,
            candidate.kind.db(),
            candidate.event.as_ref().map(|event| event.id),
        )
        .execute(&state.pool)
        .await?
        .rows_affected();
        if claimed == 0 {
            continue;
        }
        let email = message(state, &candidate, free);
        match state
            .send_mail(MailKind::Reminder, &candidate.email, &email)
            .await
        {
            Ok(()) => sent += 1,
            Err(MailError::Quota(_)) => {
                // The day's quota ran out: this one waits for a later run.
                sqlx::query!("delete from reminder_sends where id = $1", id)
                    .execute(&state.pool)
                    .await?;
                break;
            }
            Err(MailError::Failed(_)) => {
                sqlx::query!(
                    "update reminder_sends set status = 'failed' where id = $1",
                    id
                )
                .execute(&state.pool)
                .await?;
            }
        }
    }
    Ok(sent)
}

/// Who is due, the most useful first: events about to happen, then accounts that just arrived.
async fn candidates(state: &AppState, limit: i64) -> ApiResult<Vec<Candidate>> {
    let mut out = Vec::new();
    // Owners of an organization that is not suspended, who did not turn reminders off.
    let events = sqlx::query!(
        r#"select kind as "kind!", user_id as "user_id!", email as "email!", event_id as "event_id!",
                  name as "name!", starts_at as "starts_at!", utc_offset_minutes as "utc_offset_minutes!",
                  tokens as "tokens!"
           from (
             select distinct on (k.kind, u.id, e.id) k.kind, u.id as user_id, u.email::text as email,
                    e.id as event_id, e.name, e.starts_at, e.utc_offset_minutes,
                    e.kind = 'tokens' as tokens, k.priority
             from events e
             join organizations o on o.id = e.organization_id and o.suspended_at is null
             join memberships m on m.organization_id = e.organization_id and m.role = 'owner'
             join users u on u.id = m.user_id and u.reminder_emails
             cross join lateral (
               select 'door_setup' as kind, 0 as priority
               where e.starts_at between now() + interval '12 hours' and now() + interval '3 days'
                 and exists (select 1 from ticket_batches b where b.event_id = e.id and b.status = 'paid')
                 and not exists (select 1 from door_accesses d where d.event_id = e.id and d.revoked_at is null)
               union all
               select 'unpaid_batch', 1
               where e.starts_at > now() + interval '1 day'
                 and not exists (select 1 from ticket_batches b where b.event_id = e.id
                                 and b.status in ('paid', 'refunded'))
                 and exists (select 1 from ticket_batches b where b.event_id = e.id
                             and b.status = 'awaiting_payment' and b.price_cents > 0
                             and b.created_at < now() - interval '1 day'
                             and not exists (select 1 from payments p where p.batch_id = b.id
                                             and (p.status = 'processing'
                                                  or (p.status = 'open' and p.expires_at > now())
                                                  or p.created_at > now() - interval '1 day')))
               union all
               select 'event_stalled', 2
               where e.created_at < now() - interval '3 days'
                 and e.starts_at > now() + interval '1 day'
                 and coalesce(u.last_login_at, u.created_at) < now() - interval '2 days'
                 and not exists (select 1 from ticket_batches b where b.event_id = e.id
                                 and b.status in ('paid', 'refunded'))
                 -- A batch waiting for its payment has its own reminder.
                 and not exists (select 1 from ticket_batches b where b.event_id = e.id
                                 and b.status = 'awaiting_payment' and b.price_cents > 0)
               union all
               select 'after_event', 3
               where e.ends_at between now() - interval '3 days' and now() - interval '12 hours'
                 and exists (select 1 from ticket_batches b where b.event_id = e.id and b.status = 'paid')
             ) k
             where e.status = 'active' and e.canceled_at is null
               and not exists (select 1 from reminder_sends r
                               where r.user_id = u.id and r.kind = k.kind and r.event_id = e.id)
           ) due
           order by priority, starts_at
           limit $1"#,
        limit
    )
    .fetch_all(&state.pool)
    .await?;
    for row in events {
        let kind = match row.kind.as_str() {
            "door_setup" => ReminderKind::DoorSetup,
            "event_stalled" => ReminderKind::EventStalled,
            "unpaid_batch" => ReminderKind::UnpaidBatch,
            _ => ReminderKind::AfterEvent,
        };
        out.push(Candidate {
            kind,
            user_id: row.user_id,
            email: row.email,
            event: Some(EventFacts {
                id: row.event_id,
                name: row.name,
                starts_at: row.starts_at,
                utc_offset_minutes: i32::from(row.utc_offset_minutes),
                tokens: row.tokens,
            }),
        });
    }
    let left = limit - i64::try_from(out.len()).unwrap_or(limit);
    if left <= 0 {
        return Ok(out);
    }
    out.extend(accounts_without_events(state, left).await?);
    Ok(out)
}

/// Accounts that never made an event (theirs or as part of a team), newest first.
async fn accounts_without_events(state: &AppState, limit: i64) -> ApiResult<Vec<Candidate>> {
    let accounts = sqlx::query!(
        r#"select u.id, u.email::text as "email!",
                  exists(select 1 from reminder_sends r where r.user_id = u.id
                         and r.kind = 'no_event_first') as "had_first!"
           from users u
           where u.reminder_emails
             and u.created_at < now() - interval '1 day'
             and not exists (select 1 from memberships m join events e on e.organization_id = m.organization_id
                             where m.user_id = u.id)
             and not exists (select 1 from event_team t where t.user_id = u.id)
             and exists (select 1 from memberships m join organizations o on o.id = m.organization_id
                         where m.user_id = u.id and o.suspended_at is null)
             and not exists (select 1 from reminder_sends r where r.user_id = u.id
                             and r.kind = 'no_event_second')
             and not exists (select 1 from reminder_sends r where r.user_id = u.id
                             and r.kind = 'no_event_first' and r.created_at > now() - interval '7 days')
           order by u.created_at desc
           limit $1"#,
        limit
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(accounts
        .into_iter()
        .map(|row| Candidate {
            kind: if row.had_first {
                ReminderKind::NoEventSecond
            } else {
                ReminderKind::NoEventFirst
            },
            user_id: row.id,
            email: row.email,
            event: None,
        })
        .collect())
}

/// "sábado, 20 de novembro, às 22h" in the event's own time.
fn when(event: &EventFacts) -> String {
    const WEEKDAYS: [&str; 7] = [
        "segunda-feira",
        "terça-feira",
        "quarta-feira",
        "quinta-feira",
        "sexta-feira",
        "sábado",
        "domingo",
    ];
    const MONTHS: [&str; 12] = [
        "janeiro",
        "fevereiro",
        "março",
        "abril",
        "maio",
        "junho",
        "julho",
        "agosto",
        "setembro",
        "outubro",
        "novembro",
        "dezembro",
    ];
    let offset = UtcOffset::from_whole_seconds(event.utc_offset_minutes.saturating_mul(60))
        .unwrap_or(UtcOffset::UTC);
    let local = event.starts_at.to_offset(offset);
    let weekday = WEEKDAYS
        .get(usize::from(local.weekday().number_days_from_monday()))
        .copied()
        .unwrap_or_default();
    let month = MONTHS
        .get(usize::from(u8::from(local.month()).saturating_sub(1)))
        .copied()
        .unwrap_or_default();
    let time = if local.minute() == 0 {
        format!("{}h", local.hour())
    } else {
        format!("{}h{:02}", local.hour(), local.minute())
    };
    format!("{weekday}, {} de {month}, às {time}", local.day())
}

/// What a reminder says, before the e-mail's frame.
struct Content {
    subject: String,
    title: String,
    paragraphs: Vec<String>,
    steps: Vec<(&'static str, &'static str)>,
    cta: &'static str,
    url: String,
    closing: Option<&'static str>,
}

/// The e-mail of a reminder, with its own way out.
fn message(state: &AppState, candidate: &Candidate, free: i32) -> emails::Email {
    let site = &state.config.public_web_url;
    let token = crate::mailings::reminder_token(&state.config.master_key, candidate.user_id);
    let unsubscribe_url = format!("{site}/descadastrar#{token}");
    let one_click_url = format!(
        "{}/api/email/unsubscribe/{token}",
        state.config.public_api_url
    );
    let c = content(site, candidate, free);
    emails::reminder(
        &ReminderMail {
            subject: &c.subject,
            title: &c.title,
            paragraphs: &c.paragraphs,
            steps: &c.steps,
            cta: (c.cta, &c.url),
            closing: c.closing,
            unsubscribe_url: &unsubscribe_url,
            one_click_url: &one_click_url,
        },
        site,
    )
}

#[expect(
    clippy::too_many_lines,
    reason = "one arm per reminder, with its texts inline"
)]
fn content(site: &str, candidate: &Candidate, free: i32) -> Content {
    let panel = format!("{site}/painel");
    let free_line = (free > 0).then(|| {
        format!(
            "Os primeiros {free} ingressos são grátis: dá para fazer o primeiro evento sem pagar nada."
        )
    });
    let event_url = |tab: &str| {
        candidate.event.as_ref().map_or_else(
            || panel.clone(),
            |event| format!("{site}/painel/eventos/{}?aba={tab}", event.id),
        )
    };
    let (subject, title, paragraphs, steps, cta, url, closing) = match (candidate.kind, &candidate.event) {
        (ReminderKind::NoEventFirst, _) => (
            "Seu primeiro evento sai em poucos minutos".to_owned(),
            "Vamos fazer o seu primeiro evento?".to_owned(),
            [
                Some("Você criou sua conta no Ingresso Impresso, mas ainda não criou um evento. Leva poucos minutos e não precisa de nenhum programa.".to_owned()),
                free_line,
            ]
            .into_iter()
            .flatten()
            .collect(),
            vec![
                ("Crie o evento", "Nome, data e local."),
                ("Monte o ingresso", "Escolha um modelo pronto e ponha a sua arte."),
                ("Gere e imprima", "Em casa, na gráfica ou mande pelo WhatsApp."),
                ("Confira na porta", "Qualquer celular lê o QR, até sem internet."),
            ],
            "Criar meu primeiro evento",
            panel,
            Some("Dúvidas? É só responder este e-mail."),
        ),
        (ReminderKind::NoEventSecond, _) => (
            "Ingressos numerados, sem planilha e sem papel solto".to_owned(),
            "Ainda dá tempo de usar o Ingresso Impresso".to_owned(),
            [
                Some("Bandas, escolas, igrejas e festas usam o Ingresso Impresso para vender ingresso na mão sem perder o controle: cada ingresso tem número e um QR que não dá para copiar, cada vendedor tem o seu acerto e a portaria confere tudo pelo celular.".to_owned()),
                free_line,
            ]
            .into_iter()
            .flatten()
            .collect(),
            Vec::new(),
            "Criar um evento",
            panel,
            Some("Se não for a hora agora, tudo bem: sua conta fica aqui."),
        ),
        (ReminderKind::EventStalled, Some(event)) => (
            format!("{}: falta pouco para os ingressos", event.name),
            "Seu evento está quase pronto".to_owned(),
            vec![format!(
                "Você criou o evento {}, mas ainda não gerou {}. Ele é {}.",
                event.name,
                if event.tokens { "as fichas" } else { "os ingressos" },
                when(event)
            )],
            vec![
                ("Monte o ingresso", "Um modelo pronto já resolve; troque as cores e a arte se quiser."),
                ("Gere os números", "Em Gerar ingressos, diga quantos quer."),
                ("Imprima ou mande", "PDF para a gráfica, para imprimir em casa ou pelo celular."),
            ],
            "Continuar o evento",
            event_url("visao-geral"),
            Some("O card O que falta, na página do evento, mostra o próximo passo."),
        ),
        (ReminderKind::UnpaidBatch, Some(event)) => {
            let what = if event.tokens { "fichas" } else { "ingressos" };
            (
                format!("{}: o lote de {what} está esperando o pagamento", event.name),
                "Falta só o pagamento".to_owned(),
                vec![
                    format!(
                        "Você pediu um lote de {what} para {}, que é {}, mas o pagamento não foi concluído.",
                        event.name,
                        when(event)
                    ),
                    format!("Os números continuam reservados para você: pagando, os arquivos com os {what} ficam prontos em minutos."),
                ],
                vec![
                    if event.tokens {
                        ("Abra Gerar fichas", "Na página do evento.")
                    } else {
                        ("Abra Gerar ingressos", "Na página do evento.")
                    },
                    ("Pague com Pix ou cartão", "O pagamento é confirmado na hora."),
                    ("Gere e imprima", "Em casa, na gráfica ou pelo celular."),
                ],
                "Pagar o lote",
                event_url("lotes"),
                Some("Teve algum problema para pagar? É só responder este e-mail."),
            )
        }
        (ReminderKind::DoorSetup, Some(event)) => (
            format!("{}: prepare a portaria", event.name),
            "Falta preparar a portaria".to_owned(),
            vec![format!(
                "O evento {} é {} e a portaria ainda não tem um link. Sem ele, ninguém consegue conferir {} no celular.",
                event.name,
                when(event),
                if event.tokens { "as fichas" } else { "os ingressos" }
            )],
            vec![
                ("Crie o link da portaria", "Um link por porta ou equipe, na seção Portaria."),
                ("Abra no celular", "Ele baixa a lista e funciona até sem internet."),
                ("Faça o ensaio", "Leia o ingresso de amostra para ver tudo funcionando."),
            ],
            "Preparar a portaria",
            event_url("portaria"),
            None,
        ),
        (ReminderKind::AfterEvent, Some(event)) => (
            format!("Como foi {}?", event.name),
            format!("Como foi {}?", event.name),
            vec![
                "Na página do evento você vê quantos entraram, o acerto de cada vendedor e o resumo final, pronto para compartilhar com a equipe.".to_owned(),
                "Tem outro evento vindo? Duplique este: o ingresso, os vendedores e a equipe vão junto.".to_owned(),
            ],
            Vec::new(),
            "Ver como foi",
            event_url("relatorio"),
            Some("Obrigado por usar o Ingresso Impresso."),
        ),
        // An event reminder always carries its event; without it, the panel.
        (_, None) => (
            "Seu painel no Ingresso Impresso".to_owned(),
            "Seu painel no Ingresso Impresso".to_owned(),
            Vec::new(),
            Vec::new(),
            "Abrir o painel",
            panel,
            None,
        ),
    };
    Content {
        subject,
        title,
        paragraphs,
        steps,
        cta,
        url,
        closing,
    }
}

#[cfg(test)]
mod tests {
    use time::macros::datetime;

    use super::*;

    #[test]
    fn reminders_wait_for_brasilia_working_hours() {
        // 11:59 UTC is 8:59 in Brasília; 12:00 is 9:00; 22:59 is 19:59; 23:00 is 20:00.
        assert!(!sending_hours(datetime!(2026-11-02 11:59 UTC)));
        assert!(sending_hours(datetime!(2026-11-02 12:00 UTC)));
        assert!(sending_hours(datetime!(2026-11-02 22:59 UTC)));
        assert!(!sending_hours(datetime!(2026-11-02 23:00 UTC)));
    }

    #[test]
    fn the_date_is_in_the_event_time() {
        let event = EventFacts {
            id: Uuid::nil(),
            name: "Show".to_owned(),
            starts_at: datetime!(2026-11-21 01:00 UTC),
            utc_offset_minutes: -180,
            tokens: false,
        };
        assert_eq!(when(&event), "sexta-feira, 20 de novembro, às 22h");
    }
}
