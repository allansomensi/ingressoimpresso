//! E-mails sent by the API (ADR 0028), in Portuguese: a plain-text body and an HTML body built on
//! one table-based layout that survives Gmail, Outlook and Apple Mail, light and dark.
//!
//! Every value that comes from a user (an event name) goes through [`escape`]. The layout loads
//! no remote font or script; the only image is the app icon, with alt text, so the message reads
//! the same with images blocked.

use std::fmt::Write as _;

/// A message ready to send.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Email {
    /// Subject line.
    pub subject: String,
    /// Plain-text alternative (also what tests read).
    pub text: String,
    /// HTML body.
    pub html: String,
    /// One-click unsubscribe address (RFC 8058), for announcements only (ADR 0107).
    pub list_unsubscribe: Option<String>,
}

const BRAND: &str = "#5b3df5";
const INK: &str = "#0e0d14";
const MUTED: &str = "#5b5a6b";
const PAGE: &str = "#f4f3f8";
const BORDER: &str = "#e4e4ea";

/// HTML-escapes text for element content and double-quoted attributes.
pub fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            other => out.push(other),
        }
    }
    out
}

/// The shared frame: preheader (inbox preview), header with the brand, white card, footer.
fn layout(site: &str, preheader: &str, content: &str, footer_note: &str) -> String {
    let site = escape(site);
    format!(
        r#"<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Ingresso Impresso</title>
<style>
  @media (prefers-color-scheme: dark) {{
    .page {{ background: #0a0910 !important; }}
    .card {{ background: #12111a !important; border-color: #262433 !important; }}
    .ink {{ color: #f3f2f9 !important; }}
    .muted {{ color: #a7a5b9 !important; }}
    .code {{ background: #1e1940 !important; color: #ffffff !important; border-color: #363446 !important; }}
    .rule {{ border-color: #262433 !important; }}
  }}
  @media (max-width: 600px) {{
    .card-cell {{ padding: 28px 22px !important; }}
  }}
</style>
</head>
<body style="margin:0;padding:0;background:{PAGE};" class="page">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{preheader}&#8202;&#847;&#8202;&#847;&#8202;&#847;&#8202;&#847;&#8202;&#847;&#8202;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{PAGE};" class="page">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr>
          <td style="padding:0 4px 20px 4px;">
            <a href="{site}" style="text-decoration:none;">
              <img src="{site}/icons/icon-192.png" width="36" height="36" alt="" style="vertical-align:middle;border:0;border-radius:9px;">
              <span class="ink" style="vertical-align:middle;margin-left:10px;font:600 17px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:{INK};letter-spacing:-0.2px;">Ingresso Impresso</span>
            </a>
          </td>
        </tr>
        <tr>
          <td class="card" style="background:#ffffff;border:1px solid {BORDER};border-radius:18px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="card-cell" style="padding:36px 36px 32px 36px;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:{INK};">
{content}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="muted" style="padding:22px 8px 0 8px;font:13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:{MUTED};text-align:center;">
            {footer_note}<br>
            <a href="{site}" style="color:{MUTED};text-decoration:underline;">Ingresso Impresso</a> · ingressos numerados com QR à prova de cópia
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>"#,
        preheader = escape(preheader),
    )
}

fn heading(text: &str) -> String {
    format!(
        r#"<h1 class="ink" style="margin:0 0 12px 0;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.4px;color:{INK};">{}</h1>"#,
        escape(text)
    )
}

fn paragraph(html: &str) -> String {
    format!(r#"<p class="muted" style="margin:0 0 16px 0;color:{MUTED};">{html}</p>"#)
}

fn button(href: &str, label: &str) -> String {
    format!(
        r#"<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;"><tr><td style="border-radius:12px;background:{BRAND};"><a href="{}" style="display:inline-block;padding:14px 26px;font-weight:600;font-size:16px;color:#ffffff;text-decoration:none;border-radius:12px;">{}</a></td></tr></table>"#,
        escape(href),
        escape(label)
    )
}

/// The login code (ADR 0012), valid for `minutes`.
pub fn login_code(code: &str, minutes: i64, site: &str) -> Email {
    let subject = format!("Seu código de acesso: {code}");
    let text = format!(
        "Olá!\n\nSeu código para entrar no Ingresso Impresso é:\n\n    {code}\n\n\
         Ele vale por {minutes} minutos e só funciona uma vez.\n\n\
         Não pediu este código? Ignore este e-mail: ninguém entra na sua conta sem ele.\n\n\
         Ingresso Impresso\n{site}\n"
    );
    let mut content = heading("Seu código de acesso");
    content.push_str(&paragraph(
        "Digite este código na tela de entrada do Ingresso Impresso:",
    ));
    let _ = write!(
        content,
        r#"<div class="code" style="margin:8px 0 20px 0;padding:18px 12px;border:1px solid {BORDER};border-radius:14px;background:#f2efff;text-align:center;font:700 34px/1.2 'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace;letter-spacing:10px;color:{INK};">{}</div>"#,
        escape(code)
    );
    content.push_str(&paragraph(&format!(
        "Ele vale por <strong>{minutes} minutos</strong> e só funciona uma vez."
    )));
    let _ = write!(
        content,
        r#"<hr class="rule" style="border:0;border-top:1px solid {BORDER};margin:24px 0 16px 0;"><p class="muted" style="margin:0;font-size:14px;color:{MUTED};">Não pediu este código? Ignore este e-mail: ninguém entra na sua conta sem ele.</p>"#
    );
    let html = layout(
        site,
        &format!("Use o código {code} para entrar. Ele vale por {minutes} minutos."),
        &content,
        "Você recebeu este e-mail porque este endereço foi usado para entrar no Ingresso Impresso.",
    );
    Email {
        list_unsubscribe: None,
        subject,
        text,
        html,
    }
}

/// What a paid-batch e-mail tells.
#[derive(Debug, Clone)]
pub struct BatchPaid<'a> {
    /// Event name (user text).
    pub event_name: &'a str,
    /// First ticket number.
    pub first: i32,
    /// Last ticket number.
    pub last: i32,
    /// Amount paid, formatted (`R$ 12,90`).
    pub amount: &'a str,
    /// Where to generate the files.
    pub files_url: &'a str,
    /// Consumption tokens (ADR 0084): the e-mail speaks of fichas (ADR 0086).
    pub tokens: bool,
}

/// A batch paid online (Stripe): the files can be generated.
pub fn batch_paid(paid: &BatchPaid<'_>, site: &str) -> Email {
    let quantity = paid.last - paid.first + 1;
    let (one, many, label, freed) = if paid.tokens {
        ("ficha", "fichas", "Fichas", "As fichas já estão liberadas")
    } else {
        (
            "ingresso",
            "ingressos",
            "Ingressos",
            "Os ingressos já estão liberados",
        )
    };
    let tickets = if quantity == 1 {
        format!("1 {one}")
    } else {
        format!("{} {many}", thousands(quantity))
    };
    let subject = format!("Pagamento confirmado: {}", paid.event_name);
    let text = format!(
        "Pagamento confirmado!\n\n\
         Evento: {event}\n{label}: {tickets} (nº {first} a {last})\nValor: {amount}\n\n\
         {freed}. Gere os arquivos para imprimir ou enviar:\n{url}\n\n\
         Ingresso Impresso\n{site}\n",
        event = paid.event_name,
        first = paid.first,
        last = paid.last,
        amount = paid.amount,
        url = paid.files_url,
    );
    let mut content = heading("Pagamento confirmado");
    let (lead, freed_html) = if paid.tokens {
        ("As fichas de", "estão liberadas")
    } else {
        ("Os ingressos de", "estão liberados")
    };
    content.push_str(&paragraph(&format!(
        "{lead} <strong class=\"ink\" style=\"color:{INK};\">{}</strong> {freed_html}. Agora é só gerar os arquivos para imprimir ou enviar pelo WhatsApp.",
        escape(paid.event_name)
    )));
    let row = |label: &str, value: &str| {
        format!(
            r#"<tr><td class="muted rule" style="padding:10px 0;border-top:1px solid {BORDER};color:{MUTED};font-size:14px;">{}</td><td class="ink rule" align="right" style="padding:10px 0;border-top:1px solid {BORDER};color:{INK};font-size:14px;font-weight:600;">{}</td></tr>"#,
            escape(label),
            escape(value)
        )
    };
    let _ = write!(
        content,
        r#"<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px 0;">{}{}{}</table>"#,
        row(label, &tickets),
        row(
            "Numeração",
            &format!("{} a {}", thousands(paid.first), thousands(paid.last))
        ),
        row("Valor pago", paid.amount),
    );
    content.push_str(&button(paid.files_url, "Gerar os arquivos"));
    let _ = write!(
        content,
        r#"<p class="muted" style="margin:0;font-size:14px;color:{MUTED};">O recibo do pagamento é enviado pela Stripe, que processou o Pix ou o cartão.</p>"#
    );
    let html = layout(
        site,
        &format!("{tickets} liberados para {}.", paid.event_name),
        &content,
        "Você recebeu este e-mail porque pagou um lote de ingressos no Ingresso Impresso.",
    );
    Email {
        list_unsubscribe: None,
        subject,
        text,
        html,
    }
}

/// An invite to an event's team (ADR 0055).
#[derive(Debug, Clone)]
pub struct TeamInvite<'a> {
    /// Who added the person (name or e-mail).
    pub inviter: &'a str,
    /// The event.
    pub event_name: &'a str,
    /// What the person takes care of, in words (`Recebimentos e Arte`).
    pub areas: &'a str,
    /// Where to sign in.
    pub url: &'a str,
}

/// Someone was added to an event's team: what they take care of and where to sign in.
pub fn team_invite(invite: &TeamInvite<'_>, site: &str) -> Email {
    let subject = format!("Você está na equipe de {}", invite.event_name);
    let text = format!(
        "{inviter} chamou você para a equipe de {event} no Ingresso Impresso.\n\n\
         Você vai cuidar de: {areas}.\n\n\
         Entre com este e-mail, sem senha (enviamos um código na hora):\n{url}\n\n\
         Ingresso Impresso\n{site}\n",
        inviter = invite.inviter,
        event = invite.event_name,
        areas = invite.areas,
        url = invite.url,
    );
    let mut content = heading("Você está na equipe");
    content.push_str(&paragraph(&format!(
        "<strong class=\"ink\" style=\"color:{INK};\">{}</strong> chamou você para a equipe de <strong class=\"ink\" style=\"color:{INK};\">{}</strong>.",
        escape(invite.inviter),
        escape(invite.event_name)
    )));
    content.push_str(&paragraph(&format!(
        "Você vai cuidar de: <strong class=\"ink\" style=\"color:{INK};\">{}</strong>. O resto do evento você acompanha sem mexer.",
        escape(invite.areas)
    )));
    content.push_str(&button(invite.url, "Abrir o evento"));
    let _ = write!(
        content,
        r#"<p class="muted" style="margin:0;font-size:14px;color:{MUTED};">Não tem senha: entre com este e-mail e digite o código que chega na hora, ou use o Google.</p>"#
    );
    let html = layout(
        site,
        &format!(
            "{} chamou você para a equipe de {}.",
            invite.inviter, invite.event_name
        ),
        &content,
        "Você recebeu este e-mail porque alguém adicionou este endereço à equipe de um evento no Ingresso Impresso.",
    );
    Email {
        list_unsubscribe: None,
        subject,
        text,
        html,
    }
}

/// `1.234` (Brazilian thousands separator).
/// A test sent by an admin from the e-mail panel (ADR 0041).
pub fn test_message(admin: &str, site: &str) -> Email {
    let subject = "Teste de envio do Ingresso Impresso".to_owned();
    let text = format!(
        "Este é um e-mail de teste pedido por {admin} no painel de administração.\n\n\
         Se você recebeu, o envio de e-mails está funcionando.\n\n{site}"
    );
    let content = format!(
        "{}{}{}",
        heading("Envio de e-mails funcionando"),
        paragraph(&format!(
            "Este é um e-mail de teste pedido por <strong>{}</strong> no painel de administração.",
            escape(admin)
        )),
        paragraph("Se você recebeu, os códigos de acesso e os avisos de pagamento estão chegando."),
    );
    Email {
        list_unsubscribe: None,
        html: layout(
            site,
            "Teste de envio",
            &content,
            "Enviado a pedido de um administrador.",
        ),
        subject,
        text,
    }
}

fn thousands(value: i32) -> String {
    thousands_long(i64::from(value))
}

fn thousands_long(value: i64) -> String {
    let digits = value.unsigned_abs().to_string();
    let mut out = String::new();
    for (index, c) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index).is_multiple_of(3) {
            out.push('.');
        }
        out.push(c);
    }
    if value < 0 { format!("-{out}") } else { out }
}

/// `R$ 1.234,50` from centavos.
pub fn money(cents: i32) -> String {
    money_long(i64::from(cents))
}

/// [`money`] for totals that may pass an `i32`.
pub fn money_long(cents: i64) -> String {
    let reais = cents / 100;
    let centavos = (cents % 100).unsigned_abs();
    format!("R$ {},{centavos:02}", thousands_long(reais))
}

/// Label and value rows (the admins' summary).
fn rows(items: &[(String, String)]) -> String {
    let mut html = format!(
        r#"<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;border-top:1px solid {BORDER};" class="rule">"#
    );
    for (label, value) in items {
        let _ = write!(
            html,
            r#"<tr><td class="muted" style="padding:9px 0;border-bottom:1px solid {BORDER};color:{MUTED};font-size:15px;">{}</td><td class="ink" style="padding:9px 0;border-bottom:1px solid {BORDER};color:{INK};font-size:15px;font-weight:600;text-align:right;">{}</td></tr>"#,
            escape(label),
            escape(value)
        );
    }
    html.push_str("</table>");
    html
}

fn subheading(text: &str) -> String {
    format!(
        r#"<h2 class="ink" style="margin:8px 0 8px 0;font-size:17px;line-height:1.3;font-weight:700;color:{INK};">{}</h2>"#,
        escape(text)
    )
}

/// An alert to the admins (ADR 0103).
#[derive(Debug)]
pub struct AdminAlert<'a> {
    /// Critical (red) or a warning.
    pub critical: bool,
    /// One line.
    pub title: &'a str,
    /// More about it.
    pub detail: Option<&'a str>,
    /// Where to look, a full address.
    pub url: &'a str,
}

/// An alert to the admins (ADR 0103).
pub fn admin_alert(alert: &AdminAlert<'_>, site: &str) -> Email {
    let tag = if alert.critical {
        "Urgente"
    } else {
        "Atenção"
    };
    let subject = format!("[{tag}] {}", alert.title);
    let detail = alert.detail.unwrap_or_default();
    let text = format!(
        "{tag}: {}\n\n{detail}\n\nVer no painel: {}\n\nAlerta automático do Ingresso Impresso.",
        alert.title, alert.url
    );
    let mut content = heading(alert.title);
    if !detail.is_empty() {
        content.push_str(&paragraph(&escape(detail).replace('\n', "<br>")));
    }
    content.push_str(&button(alert.url, "Ver no painel"));
    Email {
        list_unsubscribe: None,
        html: layout(
            site,
            &subject,
            &content,
            "Alerta automático para os administradores.",
        ),
        subject,
        text,
    }
}

/// The admins' daily summary (ADR 0103), already in words: each section is a title and its rows.
#[derive(Debug)]
pub struct AdminSummary<'a> {
    /// `20/10/2026`.
    pub day: &'a str,
    /// The first day of a weekly summary (ADR 0108); `None`: the daily one.
    pub since: Option<&'a str>,
    /// Each section's title and its label/value rows.
    pub sections: &'a [(String, Vec<(String, String)>)],
    /// Lines in bold before the sections ("2 alertas abertos").
    pub highlights: &'a [String],
    /// The panel.
    pub url: &'a str,
}

/// The admins' summary (ADRs 0103, 0108): of the day, or of the week when `since` is set.
pub fn admin_summary(summary: &AdminSummary<'_>, site: &str) -> Email {
    let (subject, title, lead) = match summary.since {
        Some(since) => (
            format!("Resumo da semana {since} a {} · Ingresso Impresso", summary.day),
            format!("Resumo da semana ({since} a {})", summary.day),
            "Os últimos 7 dias da plataforma.",
        ),
        None => (
            format!("Resumo do dia {} · Ingresso Impresso", summary.day),
            format!("Resumo de {}", summary.day),
            "As últimas 24 horas da plataforma.",
        ),
    };
    let mut text = format!("{title}\n");
    for line in summary.highlights {
        let _ = write!(text, "\n• {line}");
    }
    let mut content = heading(&title);
    content.push_str(&paragraph(lead));
    for line in summary.highlights {
        content.push_str(&paragraph(&format!("<strong>{}</strong>", escape(line))));
    }
    for (title, items) in summary.sections {
        let _ = write!(text, "\n\n{title}");
        for (label, value) in items {
            let _ = write!(text, "\n  {label}: {value}");
        }
        content.push_str(&subheading(title));
        content.push_str(&rows(items));
    }
    let _ = write!(text, "\n\nPainel: {}", summary.url);
    content.push_str(&button(summary.url, "Abrir o painel"));
    Email {
        list_unsubscribe: None,
        html: layout(
            site,
            &subject,
            &content,
            "Resumo para os administradores.",
        ),
        subject,
        text,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_user_text() {
        assert_eq!(
            escape(r#"<script>"Rock" & 'Roll'</script>"#),
            "&lt;script&gt;&quot;Rock&quot; &amp; &#39;Roll&#39;&lt;/script&gt;"
        );
    }

    #[test]
    fn login_code_has_the_code_everywhere() {
        let email = login_code("042137", 10, "https://exemplo.com.br");
        assert_eq!(email.subject, "Seu código de acesso: 042137");
        assert!(email.text.contains("042137"));
        assert!(email.html.contains(">042137</div>"));
        assert!(
            email
                .html
                .contains("https://exemplo.com.br/icons/icon-192.png")
        );
    }

    #[test]
    fn batch_paid_escapes_the_event_name() {
        let email = batch_paid(
            &BatchPaid {
                event_name: "<b>Show</b>",
                first: 1,
                last: 1500,
                amount: &money(12_990),
                files_url: "https://exemplo.com.br/painel/eventos/x?aba=arquivos&y=1",
                tokens: false,
            },
            "https://exemplo.com.br",
        );
        assert!(!email.html.contains("<b>Show</b>"));
        assert!(email.html.contains("&lt;b&gt;Show&lt;/b&gt;"));
        assert!(email.html.contains("aba=arquivos&amp;y=1"));
        assert!(email.text.contains("1.500 ingressos (nº 1 a 1500)"));
        assert!(email.text.contains("R$ 129,90"));
    }

    #[test]
    fn batch_paid_speaks_of_fichas_for_tokens() {
        let email = batch_paid(
            &BatchPaid {
                event_name: "Festa junina",
                first: 1,
                last: 1,
                amount: &money(990),
                files_url: "https://exemplo.com.br/painel",
                tokens: true,
            },
            "https://exemplo.com.br",
        );
        assert!(email.text.contains("Fichas: 1 ficha (nº 1 a 1)"));
        assert!(email.text.contains("As fichas já estão liberadas"));
        assert!(email.html.contains("As fichas de"));
        assert!(!email.text.to_lowercase().contains("ingressos"));
    }

    #[test]
    fn formats_numbers() {
        assert_eq!(thousands(0), "0");
        assert_eq!(thousands(999), "999");
        assert_eq!(thousands(1000), "1.000");
        assert_eq!(thousands(1_234_567), "1.234.567");
        assert_eq!(money(5), "R$ 0,05");
        assert_eq!(money(290), "R$ 2,90");
        assert_eq!(money(123_456), "R$ 1.234,56");
    }
}

/// An announcement sent by e-mail (ADR 0107).
#[derive(Debug)]
pub struct AnnouncementMail<'a> {
    /// The title (also the subject).
    pub title: &'a str,
    /// The text; blank lines split paragraphs.
    pub body: &'a str,
    /// The button: label and absolute address.
    pub cta: Option<(&'a str, &'a str)>,
    /// Where the recipient stops these e-mails (the page with the token in its fragment).
    pub unsubscribe_url: &'a str,
    /// One-click unsubscribe of the mail clients (RFC 8058).
    pub one_click_url: &'a str,
}

/// An announcement to the organizers, with the way out of these e-mails.
pub fn announcement(mail: &AnnouncementMail<'_>, site: &str) -> Email {
    let paragraphs: Vec<&str> = mail
        .body
        .split("\n\n")
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect();
    let mut text = format!("{}\n\n{}\n\n", mail.title, paragraphs.join("\n\n"));
    if let Some((label, url)) = mail.cta {
        let _ = write!(text, "{label}: {url}\n\n");
    }
    let _ = write!(
        text,
        "Ingresso Impresso\n{site}\n\nNão quer mais receber comunicados por e-mail? {}\n",
        mail.unsubscribe_url
    );
    let mut content = heading(mail.title);
    for part in &paragraphs {
        content.push_str(&paragraph(&escape(part).replace('\n', "<br>")));
    }
    if let Some((label, url)) = mail.cta {
        content.push_str(&button(url, label));
    }
    let preheader: String = paragraphs
        .first()
        .map(|part| part.chars().take(120).collect())
        .unwrap_or_default();
    let footer = format!(
        "Você recebe comunicados porque tem uma conta no Ingresso Impresso. Códigos de acesso e avisos de pagamento continuam chegando sempre.<br><a href=\"{}\" style=\"color:{MUTED};text-decoration:underline;\">Parar de receber comunicados</a>",
        escape(mail.unsubscribe_url)
    );
    Email {
        subject: mail.title.to_owned(),
        html: layout(site, &preheader, &content, &footer),
        text,
        list_unsubscribe: Some(mail.one_click_url.to_owned()),
    }
}
