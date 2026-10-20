//! Revenue reports for the accountant and the admins (ADR 0106): the month's closing (on screen,
//! as a spreadsheet and as CSV), sign-up cohorts and what each coupon or promotion cost and
//! brought. All in Brasília time; money as it moved, from `revenue_entries`.

use std::collections::BTreeMap;
use std::fmt::Write as _;

use axum::Json;
use axum::extract::{Query, State};
use axum::response::Response;
use serde::Deserialize;
use ticket_render::{Cell, Sheet, Workbook};
use uuid::Uuid;

use super::admin::{audit, require_admin};
use super::ledger::attachment;
use crate::api::{
    AdminClosingDto, AdminClosingLineDto, AdminClosingMethodDto, AdminClosingOrganizationDto,
    AdminCohortDto, AdminCouponReturnDto, ClosingLineKind, CouponSource,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Months of cohorts shown (this one and the 11 before).
const COHORT_MONTHS: i64 = 12;

/// The month of a report.
#[derive(Debug, Deserialize)]
pub struct MonthQuery {
    /// `YYYY-MM`.
    month: String,
}

/// `YYYY-MM`, checked (years 2020–2100).
fn month(text: &str) -> ApiResult<String> {
    let invalid = || bad_request("invalid_month", "month must be YYYY-MM");
    let (year, month) = text.trim().split_once('-').ok_or_else(invalid)?;
    let year: u16 = year.parse().map_err(|_| invalid())?;
    let month: u8 = month.parse().map_err(|_| invalid())?;
    if year.to_string().len() != 4 || !(2020..=2100).contains(&year) || !(1..=12).contains(&month) {
        return Err(invalid());
    }
    Ok(format!("{year}-{month:02}"))
}

/// The month's closing.
#[expect(
    clippy::too_many_lines,
    reason = "two queries and one pass over the entries, read best together"
)]
pub(crate) async fn closing_of(state: &AppState, month: &str) -> ApiResult<AdminClosingDto> {
    let rows = sqlx::query!(
        r#"with bounds as (
             select (($1 || '-01')::timestamp at time zone 'America/Sao_Paulo') as start,
                    ((($1 || '-01')::timestamp + interval '1 month') at time zone 'America/Sao_Paulo') as finish
           )
           select r.at as "at!", r.kind as "kind!", r.cents as "cents!", b.id as batch_id,
                  lower(b.numbers) as "first!", upper(b.numbers) - 1 as "last!", b.free_tickets,
                  b.list_price_cents, b.discount_cents, b.credit_cents, b.paid_via,
                  (select p.payment_intent_id from payments p
                   where p.batch_id = b.id and p.status in ('paid', 'refunded')
                   order by p.paid_at desc nulls last limit 1) as reference,
                  e.id as event_id, e.name as event_name, o.id as organization_id,
                  o.name as organization_name
           from revenue_entries r cross join bounds
           join ticket_batches b on b.id = r.batch_id
           join events e on e.id = b.event_id
           join organizations o on o.id = e.organization_id
           where r.at >= bounds.start and r.at < bounds.finish
           order by r.at, b.id"#,
        month,
    )
    .fetch_all(&state.pool)
    .await?;
    let other = sqlx::query!(
        r#"with bounds as (
             select (($1 || '-01')::timestamp at time zone 'America/Sao_Paulo') as start,
                    ((($1 || '-01')::timestamp + interval '1 month') at time zone 'America/Sao_Paulo') as finish
           )
           select
             coalesce((select sum(amount_cents) from credit_ledger, bounds
                       where amount_cents > 0 and reason in ('promo_code', 'admin_adjustment', 'referral')
                         and created_at >= bounds.start and created_at < bounds.finish), 0)::bigint as "issued!",
             coalesce((select sum(amount_cents) from credit_ledger, bounds
                       where created_at < bounds.finish), 0)::bigint as "balance!",
             coalesce((select sum(amount_cents) from payment_disputes, bounds
                       where status = 'lost' and closed_at >= bounds.start and closed_at < bounds.finish), 0)::bigint as "disputes!"
           "#,
        month,
    )
    .fetch_one(&state.pool)
    .await?;

    let mut closing = AdminClosingDto {
        month: month.to_owned(),
        gross_cents: 0,
        refunds_cents: 0,
        net_cents: 0,
        stripe_cents: 0,
        manual_cents: 0,
        list_cents: 0,
        discount_cents: 0,
        credit_used_cents: 0,
        credit_issued_cents: other.issued,
        credit_balance_cents: other.balance,
        batches: 0,
        tickets: 0,
        free_tickets: 0,
        disputes_lost_cents: other.disputes,
        methods: Vec::new(),
        organizations: Vec::new(),
        lines: Vec::with_capacity(rows.len()),
    };
    let mut methods: BTreeMap<String, AdminClosingMethodDto> = BTreeMap::new();
    let mut organizations: BTreeMap<Uuid, AdminClosingOrganizationDto> = BTreeMap::new();
    for row in rows {
        let payment = row.kind == "gross";
        let organization = organizations.entry(row.organization_id).or_insert_with(|| {
            AdminClosingOrganizationDto {
                id: row.organization_id,
                name: row.organization_name.clone(),
                batches: 0,
                gross_cents: 0,
                refunds_cents: 0,
            }
        });
        if payment {
            let method = row.paid_via.clone().unwrap_or_else(|| "admin".to_owned());
            closing.gross_cents += row.cents;
            if method == "stripe" {
                closing.stripe_cents += row.cents;
            } else {
                closing.manual_cents += row.cents;
            }
            closing.list_cents += i64::from(row.list_price_cents.unwrap_or(0));
            closing.discount_cents += i64::from(row.discount_cents);
            closing.credit_used_cents += i64::from(row.credit_cents);
            closing.batches += 1;
            closing.tickets += i64::from(row.last - row.first + 1);
            closing.free_tickets += i64::from(row.free_tickets);
            let entry = methods
                .entry(method.clone())
                .or_insert_with(|| AdminClosingMethodDto {
                    method,
                    batches: 0,
                    cents: 0,
                });
            entry.batches += 1;
            entry.cents += row.cents;
            organization.batches += 1;
            organization.gross_cents += row.cents;
        } else {
            closing.refunds_cents += row.cents;
            organization.refunds_cents += row.cents;
        }
        closing.lines.push(AdminClosingLineDto {
            at: row.at,
            kind: if payment {
                ClosingLineKind::Payment
            } else {
                ClosingLineKind::Refund
            },
            cents: row.cents,
            batch_id: row.batch_id,
            first: row.first,
            last: row.last,
            free_tickets: row.free_tickets,
            list_cents: row.list_price_cents,
            discount_cents: row.discount_cents,
            credit_cents: row.credit_cents,
            method: row.paid_via,
            reference: row.reference,
            event_id: row.event_id,
            event_name: row.event_name,
            organization_id: row.organization_id,
            organization_name: row.organization_name,
        });
    }
    closing.net_cents = closing.gross_cents - closing.refunds_cents;
    closing.methods = methods.into_values().collect();
    closing
        .methods
        .sort_by(|a, b| b.cents.cmp(&a.cents).then(b.batches.cmp(&a.batches)));
    closing.organizations = organizations.into_values().collect();
    closing.organizations.sort_by(|a, b| {
        (b.gross_cents - b.refunds_cents)
            .cmp(&(a.gross_cents - a.refunds_cents))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(closing)
}

/// `GET /api/admin/reports/closing?month=`.
pub async fn closing(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<MonthQuery>,
) -> ApiResult<Json<AdminClosingDto>> {
    require_admin(&user)?;
    let month = month(&query.month)?;
    Ok(Json(closing_of(&state, &month).await?))
}

/// The way of payment, in words.
fn method_label(method: Option<&str>) -> &'static str {
    match method {
        Some("stripe") => "Stripe",
        Some("credit") => "Crédito",
        Some("free") => "Grátis",
        _ => "Marcado pelo admin",
    }
}

/// `YYYY-MM` as `MM/YYYY`.
fn month_label(month: &str) -> String {
    month.split_once('-').map_or_else(
        || month.to_owned(),
        |(year, month)| format!("{month}/{year}"),
    )
}

/// Date and time in Brasília, `DD/MM/YYYY HH:MM`.
fn brasilia(at: time::OffsetDateTime) -> String {
    let at = at.to_offset(time::macros::offset!(-3));
    format!(
        "{:02}/{:02}/{} {:02}:{:02}",
        at.day(),
        u8::from(at.month()),
        at.year(),
        at.hour(),
        at.minute()
    )
}

/// The closing as a workbook: summary, entries and organizations.
#[expect(
    clippy::too_many_lines,
    reason = "the sheets read top to bottom, like the file"
)]
fn workbook(closing: &AdminClosingDto) -> Workbook {
    let text = |value: &str| Cell::Text(value.to_owned());
    let money_row = |label: &str, cents: i64| vec![text(label), Cell::Money(cents)];
    let mut summary = vec![
        vec![Cell::Bold(format!(
            "Fechamento de {} · Ingresso Impresso",
            month_label(&closing.month)
        ))],
        vec![text(
            "Horário de Brasília. Cada valor conta na data em que o dinheiro entrou ou saiu.",
        )],
        vec![],
        vec![
            Cell::Header("Receita".to_owned()),
            Cell::Header("Valor".to_owned()),
        ],
        money_row("Recebido", closing.gross_cents),
        money_row("  pela Stripe", closing.stripe_cents),
        money_row(
            "  fora da Stripe (marcado pelo admin)",
            closing.manual_cents,
        ),
        money_row("Devolvido (reembolsos e estornos)", closing.refunds_cents),
        vec![
            Cell::Bold("Receita líquida".to_owned()),
            Cell::MoneyBold(closing.net_cents),
        ],
        vec![],
        vec![
            Cell::Header("Lotes pagos no mês".to_owned()),
            Cell::Header("Valor".to_owned()),
        ],
        money_row("Preço de tabela", closing.list_cents),
        money_row("Descontos (promoções e cupons)", closing.discount_cents),
        money_row("Pago com crédito", closing.credit_used_cents),
        vec![text("Lotes"), Cell::Int(closing.batches)],
        vec![text("Ingressos"), Cell::Int(closing.tickets)],
        vec![text("  grátis"), Cell::Int(closing.free_tickets)],
        vec![],
        vec![
            Cell::Header("Crédito e contestações".to_owned()),
            Cell::Header("Valor".to_owned()),
        ],
        money_row("Crédito concedido no mês", closing.credit_issued_cents),
        money_row(
            "Crédito em aberto no fim do mês",
            closing.credit_balance_cents,
        ),
        money_row("Contestações perdidas", closing.disputes_lost_cents),
        vec![],
        vec![
            Cell::Header("Forma".to_owned()),
            Cell::Header("Lotes".to_owned()),
            Cell::Header("Recebido".to_owned()),
        ],
    ];
    for method in &closing.methods {
        summary.push(vec![
            text(method_label(Some(&method.method))),
            Cell::Int(method.batches),
            Cell::Money(method.cents),
        ]);
    }
    let mut lines = vec![
        [
            "Data",
            "Tipo",
            "Organização",
            "Evento",
            "Números",
            "Ingressos",
            "Grátis",
            "Tabela",
            "Desconto",
            "Crédito",
            "Valor",
            "Forma",
            "Referência",
        ]
        .map(|title| Cell::Header(title.to_owned()))
        .to_vec(),
    ];
    for line in &closing.lines {
        let refund = line.kind == ClosingLineKind::Refund;
        lines.push(vec![
            text(&brasilia(line.at)),
            text(if refund { "Devolução" } else { "Recebimento" }),
            text(&line.organization_name),
            text(&line.event_name),
            text(&format!("{} a {}", line.first, line.last)),
            Cell::Int(i64::from(line.last - line.first + 1)),
            Cell::Int(i64::from(line.free_tickets)),
            line.list_cents
                .map_or(Cell::Empty, |cents| Cell::Money(i64::from(cents))),
            Cell::Money(i64::from(line.discount_cents)),
            Cell::Money(i64::from(line.credit_cents)),
            Cell::Money(if refund { -line.cents } else { line.cents }),
            text(method_label(line.method.as_deref())),
            line.reference.as_deref().map_or(Cell::Empty, text),
        ]);
    }
    let mut organizations = vec![
        ["Organização", "Lotes", "Recebido", "Devolvido", "Líquido"]
            .map(|title| Cell::Header(title.to_owned()))
            .to_vec(),
    ];
    for organization in &closing.organizations {
        organizations.push(vec![
            text(&organization.name),
            Cell::Int(organization.batches),
            Cell::Money(organization.gross_cents),
            Cell::Money(organization.refunds_cents),
            Cell::MoneyBold(organization.gross_cents - organization.refunds_cents),
        ]);
    }
    Workbook {
        sheets: vec![
            Sheet {
                name: "Resumo".to_owned(),
                widths: vec![42, 16, 16],
                rows: summary,
            },
            Sheet {
                name: "Lançamentos".to_owned(),
                widths: vec![17, 12, 28, 28, 16, 10, 8, 12, 12, 12, 13, 18, 30],
                rows: lines,
            },
            Sheet {
                name: "Organizações".to_owned(),
                widths: vec![32, 8, 14, 14, 14],
                rows: organizations,
            },
        ],
    }
}

/// Text that starts like a formula stays text; separators and quotes are quoted.
fn csv_cell(value: &str) -> String {
    let value = if value.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        format!("'{value}")
    } else {
        value.to_owned()
    };
    if value.contains([',', '"', '\n', '\r', ';']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value
    }
}

/// Centavos as `1234,56` (the Brazilian spreadsheet's decimal comma, no thousands).
fn decimal(cents: i64) -> String {
    let sign = if cents < 0 { "-" } else { "" };
    let cents = cents.unsigned_abs();
    format!("{sign}{},{:02}", cents / 100, cents % 100)
}

/// The entries as CSV for a Brazilian spreadsheet: `;` between columns, decimal comma, BOM.
fn csv(closing: &AdminClosingDto) -> String {
    let mut out = String::from(
        "\u{feff}data;tipo;organizacao;evento;primeiro;ultimo;ingressos;gratis;tabela;desconto;credito;valor;forma;referencia;lote\r\n",
    );
    for line in &closing.lines {
        let refund = line.kind == ClosingLineKind::Refund;
        let cells = [
            brasilia(line.at),
            (if refund { "devolucao" } else { "recebimento" }).to_owned(),
            csv_cell(&line.organization_name),
            csv_cell(&line.event_name),
            line.first.to_string(),
            line.last.to_string(),
            (line.last - line.first + 1).to_string(),
            line.free_tickets.to_string(),
            line.list_cents
                .map(|cents| decimal(i64::from(cents)))
                .unwrap_or_default(),
            decimal(i64::from(line.discount_cents)),
            decimal(i64::from(line.credit_cents)),
            // A refund is money going out: negative, so a column sum is the month's net.
            decimal(if refund { -line.cents } else { line.cents }),
            line.method.clone().unwrap_or_else(|| "admin".to_owned()),
            line.reference.clone().unwrap_or_default(),
            line.batch_id.to_string(),
        ];
        let _ = write!(out, "{}\r\n", cells.join(";"));
    }
    out
}

/// `GET /api/admin/reports/closing/xlsx?month=`.
pub async fn closing_xlsx(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<MonthQuery>,
) -> ApiResult<Response> {
    require_admin(&user)?;
    let month = month(&query.month)?;
    let closing = closing_of(&state, &month).await?;
    let book = workbook(&closing);
    let bytes = tokio::task::spawn_blocking(move || ticket_render::xlsx(&book))
        .await
        .map_err(anyhow::Error::from)?
        .map_err(|error| ApiError::Internal(error.into()))?;
    audit(
        &state,
        &user,
        "report_export",
        None,
        None,
        None,
        serde_json::json!({ "month": month, "format": "xlsx" }),
    )
    .await?;
    Ok(attachment(
        &format!("fechamento-{month}.xlsx"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        bytes,
    ))
}

/// `GET /api/admin/reports/closing/csv?month=`.
pub async fn closing_csv(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<MonthQuery>,
) -> ApiResult<Response> {
    require_admin(&user)?;
    let month = month(&query.month)?;
    let closing = closing_of(&state, &month).await?;
    audit(
        &state,
        &user,
        "report_export",
        None,
        None,
        None,
        serde_json::json!({ "month": month, "format": "csv" }),
    )
    .await?;
    Ok(attachment(
        &format!("fechamento-{month}.csv"),
        "text/csv; charset=utf-8",
        csv(&closing).into_bytes(),
    ))
}

/// `GET /api/admin/reports/cohorts`: organizations by sign-up month (this one and the 11
/// before) and the net money each group brought, month by month since.
pub async fn cohorts(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<AdminCohortDto>>> {
    require_admin(&user)?;
    let groups = sqlx::query!(
        r#"with start as (
             select ((date_trunc('month', now() at time zone 'America/Sao_Paulo') - make_interval(months => $1::int - 1))
                     at time zone 'America/Sao_Paulo') as at
           ),
           months as (
             select to_char(m, 'YYYY-MM') as month
             from start, generate_series(start.at at time zone 'America/Sao_Paulo',
                                         now() at time zone 'America/Sao_Paulo', interval '1 month') m
           ),
           cohort as (
             select o.id, to_char(o.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM') as month,
                    exists (select 1 from ticket_batches b join events e on e.id = b.event_id
                            where e.organization_id = o.id and b.status in ('paid', 'refunded')) as activated,
                    exists (select 1 from ticket_batches b join events e on e.id = b.event_id
                            where e.organization_id = o.id and b.status in ('paid', 'refunded')
                              and b.price_cents > 0) as paying
             from organizations o, start where o.created_at >= start.at
           )
           select m.month as "month!", count(c.id) as "signups!",
                  count(c.id) filter (where c.activated) as "activated!",
                  count(c.id) filter (where c.paying) as "paying!"
           from months m left join cohort c on c.month = m.month
           group by m.month order by m.month desc"#,
        i32::try_from(COHORT_MONTHS).unwrap_or(12),
    )
    .fetch_all(&state.pool)
    .await?;
    let money = sqlx::query!(
        r#"with start as (
             select ((date_trunc('month', now() at time zone 'America/Sao_Paulo') - make_interval(months => $1::int - 1))
                     at time zone 'America/Sao_Paulo') as at
           )
           select to_char(o.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM') as "month!",
                  ((extract(year from r.at at time zone 'America/Sao_Paulo') * 12
                    + extract(month from r.at at time zone 'America/Sao_Paulo'))
                   - (extract(year from o.created_at at time zone 'America/Sao_Paulo') * 12
                      + extract(month from o.created_at at time zone 'America/Sao_Paulo')))::int as "offset!",
                  sum(case when r.kind = 'gross' then r.cents else -r.cents end)::bigint as "cents!"
           from revenue_entries r
           join ticket_batches b on b.id = r.batch_id
           join events e on e.id = b.event_id
           join organizations o on o.id = e.organization_id
           cross join start
           where o.created_at >= start.at
           group by 1, 2"#,
        i32::try_from(COHORT_MONTHS).unwrap_or(12),
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(
        groups
            .into_iter()
            .enumerate()
            .map(|(index, group)| {
                // Newest first: the newest cohort has one month, the oldest all of them.
                let mut by_month = vec![0_i64; index + 1];
                for item in money.iter().filter(|item| item.month == group.month) {
                    if let Some(slot) = usize::try_from(item.offset)
                        .ok()
                        .and_then(|offset| by_month.get_mut(offset))
                    {
                        *slot += item.cents;
                    }
                }
                AdminCohortDto {
                    month: group.month,
                    signups: group.signups,
                    activated: group.activated,
                    paying: group.paying,
                    revenue_cents: by_month.iter().sum(),
                    by_month,
                }
            })
            .collect(),
    ))
}

/// `GET /api/admin/reports/coupons`: every code and promotion, what it gave and what the
/// organizations that used it paid afterwards; newest first.
pub async fn coupons(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<AdminCouponReturnDto>>> {
    require_admin(&user)?;
    let codes = sqlx::query!(
        r#"select p.id, p.code, p.kind, p.created_at,
                  (select count(*) from promo_redemptions r where r.promo_code_id = p.id) as "organizations!",
                  (select count(*) from promo_redemptions r
                   where r.promo_code_id = p.id
                     and exists (select 1 from ticket_batches b join events e on e.id = b.event_id
                                 where e.organization_id = r.organization_id and b.status in ('paid', 'refunded')
                                   and b.price_cents > 0 and b.paid_at >= r.redeemed_at)) as "paying!",
                  coalesce((select sum(c.amount_cents) from credit_ledger c
                            where c.reason = 'promo_code' and c.reference_id = p.id), 0)::bigint as "credit!",
                  coalesce((select sum(b.discount_cents) from promo_redemptions r
                            join ticket_batches b on b.id = r.applied_batch_id
                            where r.promo_code_id = p.id and b.status in ('paid', 'refunded')), 0)::bigint as "discount!",
                  (case when p.kind = 'free_tickets' then coalesce(p.free_tickets, 0) else 0 end
                   * (select count(*) from promo_redemptions r where r.promo_code_id = p.id))::bigint as "free!",
                  coalesce((select sum(case when re.kind = 'gross' then re.cents else -re.cents end)
                            from promo_redemptions r
                            join events e on e.organization_id = r.organization_id
                            join ticket_batches b on b.event_id = e.id
                            join revenue_entries re on re.batch_id = b.id
                            where r.promo_code_id = p.id and b.paid_at >= r.redeemed_at), 0)::bigint as "revenue!"
           from promo_codes p
           order by p.created_at desc"#
    )
    .fetch_all(&state.pool)
    .await?;
    let promotions = sqlx::query!(
        r#"select p.id, p.name, p.created_at,
                  count(distinct e.organization_id) as "organizations!",
                  count(distinct e.organization_id) filter (where b.price_cents > 0) as "paying!",
                  coalesce(sum(b.discount_cents), 0)::bigint as "discount!",
                  coalesce((select sum(case when re.kind = 'gross' then re.cents else -re.cents end)
                            from revenue_entries re join ticket_batches pb on pb.id = re.batch_id
                            where pb.promotion_id = p.id), 0)::bigint as "revenue!"
           from promotions p
           left join ticket_batches b on b.promotion_id = p.id and b.status in ('paid', 'refunded')
           left join events e on e.id = b.event_id
           group by p.id
           order by p.created_at desc"#
    )
    .fetch_all(&state.pool)
    .await?;
    let mut all: Vec<AdminCouponReturnDto> = codes
        .into_iter()
        .map(|code| AdminCouponReturnDto {
            source: CouponSource::Code,
            id: code.id,
            name: code.code,
            kind: code.kind,
            created_at: code.created_at,
            organizations: code.organizations,
            paying: code.paying,
            credit_cents: code.credit,
            discount_cents: code.discount,
            free_tickets: code.free,
            revenue_cents: code.revenue,
        })
        .chain(
            promotions
                .into_iter()
                .map(|promotion| AdminCouponReturnDto {
                    source: CouponSource::Promotion,
                    id: promotion.id,
                    name: promotion.name,
                    kind: "promotion".to_owned(),
                    created_at: promotion.created_at,
                    organizations: promotion.organizations,
                    paying: promotion.paying,
                    credit_cents: 0,
                    discount_cents: promotion.discount,
                    free_tickets: 0,
                    revenue_cents: promotion.revenue,
                }),
        )
        .collect();
    all.sort_by_key(|item| std::cmp::Reverse(item.created_at));
    Ok(Json(all))
}

#[cfg(test)]
mod tests {
    use super::{csv_cell, decimal, month};

    #[test]
    fn months_are_checked() {
        assert_eq!(month("2026-1").ok().as_deref(), Some("2026-01"));
        assert_eq!(month(" 2026-10 ").ok().as_deref(), Some("2026-10"));
        for bad in [
            "2026", "2026-13", "1999-01", "26-01", "2026-00", "abcd-ef", "2026-01'",
        ] {
            assert!(month(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn amounts_use_the_decimal_comma() {
        assert_eq!(decimal(123_456), "1234,56");
        assert_eq!(decimal(-5), "-0,05");
        assert_eq!(decimal(0), "0,00");
        assert_eq!(csv_cell("=1+1"), "'=1+1");
        assert_eq!(csv_cell("Show; parte 2"), "\"Show; parte 2\"");
    }
}
