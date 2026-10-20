//! Accountability (ADR 0058): the expenses and other income of an event, and the report the
//! group gets (formatura committees, APMs, churches) as a summary, a PDF and a spreadsheet:
//! tickets by category and seller, what came in, what went out and the money in hand.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::http::header::{CACHE_CONTROL, CONTENT_DISPOSITION, CONTENT_TYPE};
use axum::response::{IntoResponse, Response};
use ticket_render::{
    Cell, ReportDocument, ReportFact, ReportSection, ReportTable, Sheet, Workbook,
};
use time::macros::format_description;
use time::{Date, Duration, OffsetDateTime};
use uuid::Uuid;

use super::{EventRow, authorize_event, one_line, optional_text, report};
use crate::api::{AccountabilityDto, EventReportDto, LedgerBody, LedgerEntryDto, LedgerKind};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;
use crate::texts;

const MAX_ENTRIES: i64 = 500;
const MAX_AMOUNT_CENTS: i32 = 100_000_000;
const DATE_FORMAT: &[time::format_description::BorrowedFormatItem<'static>] =
    format_description!("[year]-[month]-[day]");
const DAY_FORMAT: &[time::format_description::BorrowedFormatItem<'static>] =
    format_description!("[day]/[month]/[year]");
const MOMENT_FORMAT: &[time::format_description::BorrowedFormatItem<'static>] =
    format_description!("[day]/[month]/[year] às [hour]:[minute]");

/// `R$ 1.234,56` (negative with a minus sign).
pub(crate) fn brl(cents: i64) -> String {
    let sign = if cents < 0 { "-" } else { "" };
    let cents = cents.unsigned_abs();
    let reais = (cents / 100).to_string();
    let mut grouped = String::new();
    for (index, digit) in reais.chars().enumerate() {
        if index > 0 && (reais.len() - index).is_multiple_of(3) {
            grouped.push('.');
        }
        grouped.push(digit);
    }
    format!("{sign}R$ {grouped},{:02}", cents % 100)
}

fn whole(value: i64) -> String {
    brl(value * 100)
        .trim_start_matches("R$ ")
        .trim_end_matches(",00")
        .to_owned()
}

/// A day from 2020 up to two years ahead (some expenses are paid after the event).
fn parse_day(text: &str) -> ApiResult<Date> {
    let invalid = || bad_request("invalid_entry_date", "date must be YYYY-MM-DD");
    let date = Date::parse(text.trim(), DATE_FORMAT).map_err(|_| invalid())?;
    let limit = (OffsetDateTime::now_utc() + Duration::days(730)).date();
    if date.year() < 2020 || date > limit {
        return Err(invalid());
    }
    Ok(date)
}

fn validate(body: &LedgerBody) -> ApiResult<(String, Option<String>, Date)> {
    let description = body.description.trim().to_owned();
    if description.is_empty() || description.chars().count() > 120 {
        return Err(bad_request(
            "invalid_description",
            "description must have 1-120 characters",
        ));
    }
    one_line(&description, "invalid_description")?;
    let category = optional_text(body.category.clone());
    if let Some(category) = &category {
        if category.chars().count() > 40 {
            return Err(bad_request(
                "invalid_category",
                "category must have up to 40 characters",
            ));
        }
        one_line(category, "invalid_category")?;
    }
    if !(1..=MAX_AMOUNT_CENTS).contains(&body.amount_cents) {
        return Err(bad_request("invalid_amount", "amount out of range"));
    }
    Ok((description, category, parse_day(&body.occurred_on)?))
}

async fn entries(state: &AppState, event_id: Uuid) -> ApiResult<Vec<LedgerEntryDto>> {
    sqlx::query!(
        r#"select id, kind, description, category, amount_cents, occurred_on from event_ledger
           where event_id = $1 order by occurred_on, created_at"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| {
        Ok(LedgerEntryDto {
            id: row.id,
            kind: LedgerKind::from_db(&row.kind)
                .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("unknown ledger kind")))?,
            description: row.description,
            category: row.category,
            amount_cents: row.amount_cents,
            occurred_on: row
                .occurred_on
                .format(DATE_FORMAT)
                .map_err(|error| ApiError::Internal(error.into()))?,
        })
    })
    .collect()
}

/// `GET /api/events/{id}/ledger`.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<Vec<LedgerEntryDto>>> {
    authorize_event(&state.pool, &user, event_id).await?;
    Ok(Json(entries(&state, event_id).await?))
}

/// `POST /api/events/{id}/ledger`.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<LedgerBody>,
) -> ApiResult<(StatusCode, Json<LedgerEntryDto>)> {
    authorize_event(&state.pool, &user, event_id).await?;
    let (description, category, day) = validate(&body)?;
    let count = sqlx::query_scalar!(
        r#"select count(*) as "count!" from event_ledger where event_id = $1"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    if count >= MAX_ENTRIES {
        return Err(ApiError::Conflict(
            "too_many_entries",
            format!("an event has at most {MAX_ENTRIES} entries"),
        ));
    }
    let id = Uuid::new_v4();
    sqlx::query!(
        r#"insert into event_ledger (id, event_id, kind, description, category, amount_cents, occurred_on, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8)"#,
        id,
        event_id,
        body.kind.db(),
        description,
        category,
        body.amount_cents,
        day,
        user.id,
    )
    .execute(&state.pool)
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(LedgerEntryDto {
            id,
            kind: body.kind,
            description,
            category,
            amount_cents: body.amount_cents,
            occurred_on: body.occurred_on.trim().to_owned(),
        }),
    ))
}

async fn entry_event(state: &AppState, user: &AuthUser, entry_id: Uuid) -> ApiResult<Uuid> {
    let event_id = sqlx::query_scalar!("select event_id from event_ledger where id = $1", entry_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, user, event_id).await?;
    Ok(event_id)
}

/// `PUT /api/ledger/{id}`.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(entry_id): Path<Uuid>,
    Json(body): Json<LedgerBody>,
) -> ApiResult<StatusCode> {
    entry_event(&state, &user, entry_id).await?;
    let (description, category, day) = validate(&body)?;
    sqlx::query!(
        r#"update event_ledger set kind = $2, description = $3, category = $4, amount_cents = $5, occurred_on = $6
           where id = $1"#,
        entry_id,
        body.kind.db(),
        description,
        category,
        body.amount_cents,
        day,
    )
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `DELETE /api/ledger/{id}`.
pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(entry_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    entry_event(&state, &user, entry_id).await?;
    sqlx::query!("delete from event_ledger where id = $1", entry_id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Everything the accountability shows, computed once for the summary, the PDF and the sheet.
struct Accountability {
    event: EventRow,
    organizer: String,
    report: EventReportDto,
    summary: AccountabilityDto,
}

async fn accountability(state: &AppState, event: EventRow) -> ApiResult<Accountability> {
    let report = report::build(state, &event).await?;
    let entries_list = entries(state, event.id).await?;
    let platform_cents = sqlx::query_scalar!(
        r#"select coalesce(sum(price_cents), 0)::bigint as "cents!" from ticket_batches
           where event_id = $1 and status = 'paid'"#,
        event.id
    )
    .fetch_one(&state.pool)
    .await?;
    let organizer = sqlx::query_scalar!(
        "select o.name from events e join organizations o on o.id = e.organization_id where e.id = $1",
        event.id
    )
    .fetch_one(&state.pool)
    .await?;
    let sum = |kind: LedgerKind| -> i64 {
        entries_list
            .iter()
            .filter(|entry| entry.kind == kind)
            .map(|entry| i64::from(entry.amount_cents))
            .sum()
    };
    let other_income_cents = sum(LedgerKind::Income);
    let expenses_cents = sum(LedgerKind::Expense);
    // What sellers handed over plus the Pix the organization received for numbers of no seller
    // (digital tickets it sent itself, ADR 0085).
    let received_cents = report.totals.received_cents;
    let ticket_sales_cents = report
        .sellers
        .iter()
        .map(|row| row.amount_due_cents)
        .sum::<Option<i64>>()
        .filter(|_| {
            report
                .sellers
                .iter()
                .any(|row| row.amount_due_cents.is_some())
        });
    let outstanding_cents = report
        .sellers
        .iter()
        .map(|row| row.balance_cents.map(|balance| balance.max(0)))
        .sum::<Option<i64>>()
        .filter(|_| ticket_sales_cents.is_some());
    // Free categories, plus the courtesies given from priced ones (ADR 0096).
    let courtesies = report
        .categories
        .iter()
        .map(|row| {
            if row.price_cents == Some(0) {
                row.tickets
            } else {
                row.courtesies
            }
        })
        .sum::<i64>()
        + if report.categories.is_empty() {
            report.totals.courtesies
        } else {
            0
        };
    let commissions_cents = report
        .sellers
        .iter()
        .filter_map(|row| row.commission_cents)
        .sum();
    let summary = AccountabilityDto {
        issued: report.totals.tickets,
        sold: report.totals.declared_sold,
        courtesies,
        entries: report.totals.entries,
        ticket_sales_cents,
        received_cents,
        commissions_cents,
        outstanding_cents,
        other_income_cents,
        expenses_cents,
        platform_cents,
        balance_cents: received_cents + other_income_cents - expenses_cents - platform_cents,
        entries_list,
    };
    Ok(Accountability {
        event,
        organizer,
        report,
        summary,
    })
}

/// `GET /api/events/{id}/accountability`.
pub async fn summary(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<AccountabilityDto>> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    Ok(Json(accountability(&state, event).await?.summary))
}

fn subtitle(data: &Accountability) -> String {
    let start = data.event.starts_at.to_offset(data.event.offset());
    let mut parts = vec![start.format(MOMENT_FORMAT).unwrap_or_default()];
    if let Some(venue) = &data.event.venue {
        parts.push(venue.clone());
    }
    parts.push(data.organizer.clone());
    parts.join(" · ")
}

fn generated_line() -> String {
    // Brasília time: the footer only says when the file was made.
    let now = OffsetDateTime::now_utc().to_offset(time::macros::offset!(-3));
    texts::ACCOUNTABILITY_GENERATED
        .replace("{when}", &now.format(MOMENT_FORMAT).unwrap_or_default())
}

fn day_label(day: &str) -> String {
    Date::parse(day, DATE_FORMAT)
        .ok()
        .and_then(|date| date.format(DAY_FORMAT).ok())
        .unwrap_or_else(|| day.to_owned())
}

fn optional_brl(cents: Option<i64>) -> String {
    cents.map_or_else(|| "—".to_owned(), brl)
}

fn document(data: &Accountability) -> ReportDocument {
    let t = texts::accountability(data.event.tokens());
    let s = &data.summary;
    let spent = s.expenses_cents + s.platform_cents;
    let mut sections = vec![
        ReportSection {
            title: t.summary.to_owned(),
            note: s
                .outstanding_cents
                .filter(|cents| *cents > 0)
                .map(|cents| t.outstanding_note.replace("{amount}", &brl(cents))),
            facts: [
                vec![fact(t.received, brl(s.received_cents), true, None)],
                // Kept by the sellers (ADR 0096): never in the cash, said apart.
                (s.commissions_cents > 0)
                    .then(|| fact(t.commissions, brl(s.commissions_cents), false, None))
                    .into_iter()
                    .collect(),
                vec![
                    fact(t.other_income, brl(s.other_income_cents), false, None),
                    fact(t.spent, brl(spent), false, None),
                    fact(
                        t.balance,
                        brl(s.balance_cents),
                        true,
                        Some(if s.balance_cents < 0 { "bad" } else { "good" }),
                    ),
                ],
            ]
            .concat(),
            table: None,
        },
        ReportSection {
            title: t.tickets.to_owned(),
            note: None,
            facts: vec![
                fact(t.issued, whole(s.issued), false, None),
                fact(t.sold, whole(s.sold), false, None),
                fact(t.courtesies, whole(s.courtesies), false, None),
                fact(t.entries, whole(s.entries), false, None),
            ],
            table: None,
        },
    ];
    sections.extend(category_section(data));
    sections.extend(seller_section(data));
    sections.push(cash_section(t, s));
    ReportDocument {
        kicker: t.kicker.to_owned(),
        title: data.event.name.clone(),
        subtitle: subtitle(data),
        footer: generated_line(),
        sections,
        signatures: t
            .signatures
            .iter()
            .map(|label| (*label).to_owned())
            .collect(),
    }
}

fn table_section(title: &str, table: ReportTable) -> ReportSection {
    ReportSection {
        title: title.to_owned(),
        note: None,
        facts: Vec::new(),
        table: Some(table),
    }
}

fn category_section(data: &Accountability) -> Option<ReportSection> {
    let t = texts::accountability(data.event.tokens());
    (!data.report.categories.is_empty()).then(|| {
        table_section(
            t.by_category,
            ReportTable {
                headers: t.category_headers.iter().map(|h| (*h).to_owned()).collect(),
                rows: data
                    .report
                    .categories
                    .iter()
                    .map(|row| {
                        vec![
                            row.name.clone().unwrap_or_else(|| t.no_category.to_owned()),
                            row.price_cents
                                .map_or_else(|| "—".to_owned(), |p| brl(i64::from(p))),
                            whole(row.tickets),
                            whole(row.sold),
                            whole(row.entries),
                            optional_brl(row.amount_cents),
                        ]
                    })
                    .collect(),
                total: None,
                numeric_from: 1,
                wide: 0,
            },
        )
    })
}

fn seller_section(data: &Accountability) -> Option<ReportSection> {
    let t = texts::accountability(data.event.tokens());
    let s = &data.summary;
    let rows = &data.report.sellers;
    (!rows.is_empty()).then(|| {
        table_section(
            t.by_seller,
            ReportTable {
                headers: t.seller_headers.iter().map(|h| (*h).to_owned()).collect(),
                rows: rows
                    .iter()
                    .map(|row| {
                        vec![
                            row.seller.clone().unwrap_or_default(),
                            whole(row.tickets),
                            whole(row.unsold + row.lost),
                            whole(row.declared_sold),
                            optional_brl(row.amount_due_cents),
                            brl(row.received_cents),
                            optional_brl(row.balance_cents),
                        ]
                    })
                    .collect(),
                total: Some(vec![
                    t.total.to_owned(),
                    whole(rows.iter().map(|r| r.tickets).sum()),
                    whole(rows.iter().map(|r| r.unsold + r.lost).sum()),
                    whole(rows.iter().map(|r| r.declared_sold).sum()),
                    optional_brl(s.ticket_sales_cents),
                    brl(s.received_cents),
                    optional_brl(s.outstanding_cents),
                ]),
                numeric_from: 1,
                wide: 0,
            },
        )
    })
}

/// Money in and out: what sellers handed over, the platform, then the team's entries by day.
fn cash_section(t: &texts::AccountabilityTexts, s: &AccountabilityDto) -> ReportSection {
    let mut rows = vec![vec![
        String::new(),
        t.received_line.to_owned(),
        t.income.to_owned(),
        brl(s.received_cents),
    ]];
    if s.platform_cents > 0 {
        rows.push(vec![
            String::new(),
            t.platform_line.to_owned(),
            t.expense.to_owned(),
            brl(-s.platform_cents),
        ]);
    }
    for entry in &s.entries_list {
        let label = match &entry.category {
            Some(category) => format!("{} ({category})", entry.description),
            None => entry.description.clone(),
        };
        let (kind, amount) = match entry.kind {
            LedgerKind::Income => (t.income, i64::from(entry.amount_cents)),
            LedgerKind::Expense => (t.expense, -i64::from(entry.amount_cents)),
        };
        rows.push(vec![
            day_label(&entry.occurred_on),
            label,
            kind.to_owned(),
            brl(amount),
        ]);
    }
    ReportSection {
        title: t.cash.to_owned(),
        note: Some(t.cash_note.to_owned()),
        facts: Vec::new(),
        table: Some(ReportTable {
            headers: t.cash_headers.iter().map(|h| (*h).to_owned()).collect(),
            rows,
            total: Some(vec![
                String::new(),
                t.balance.to_owned(),
                String::new(),
                brl(s.balance_cents),
            ]),
            numeric_from: 3,
            wide: 1,
        }),
    }
}

fn fact(label: &str, value: String, strong: bool, tone: Option<&'static str>) -> ReportFact {
    ReportFact {
        label: label.to_owned(),
        value,
        strong,
        tone,
    }
}

fn header(cells: &[&str]) -> Vec<Cell> {
    cells
        .iter()
        .map(|cell| Cell::Header((*cell).to_owned()))
        .collect()
}

fn money(cents: Option<i64>) -> Cell {
    cents.map_or(Cell::Empty, Cell::Money)
}

fn workbook(data: &Accountability) -> Workbook {
    let t = texts::accountability(data.event.tokens());
    let s = &data.summary;
    let label = |text: &str| Cell::Text(text.to_owned());
    let resumo = Sheet {
        name: t.summary.to_owned(),
        widths: vec![36, 18],
        rows: vec![
            vec![Cell::Bold(data.event.name.clone())],
            vec![label(&subtitle(data))],
            vec![label(&generated_line())],
            vec![],
            header(&[t.item, t.value]),
            vec![label(t.issued), Cell::Int(s.issued)],
            vec![label(t.sold), Cell::Int(s.sold)],
            vec![label(t.courtesies), Cell::Int(s.courtesies)],
            vec![label(t.entries), Cell::Int(s.entries)],
            vec![label(t.ticket_sales), money(s.ticket_sales_cents)],
            vec![label(t.received), Cell::Money(s.received_cents)],
            vec![label(t.commissions), Cell::Money(s.commissions_cents)],
            vec![label(t.outstanding), money(s.outstanding_cents)],
            vec![label(t.other_income), Cell::Money(s.other_income_cents)],
            vec![label(t.expenses), Cell::Money(s.expenses_cents)],
            vec![label(t.platform_line), Cell::Money(s.platform_cents)],
            vec![
                Cell::Bold(t.balance.to_owned()),
                Cell::MoneyBold(s.balance_cents),
            ],
        ],
    };
    let mut sellers = vec![header(&t.seller_sheet_headers)];
    for row in &data.report.sellers {
        sellers.push(vec![
            Cell::Text(row.seller.clone().unwrap_or_default()),
            Cell::Int(row.tickets),
            Cell::Int(row.unsold),
            Cell::Int(row.lost),
            Cell::Int(row.declared_sold),
            Cell::Int(row.marked_sold),
            money(row.amount_due_cents),
            Cell::Money(row.received_cents),
            money(row.balance_cents),
        ]);
    }
    let mut categories = vec![header(&t.category_headers)];
    for row in &data.report.categories {
        categories.push(vec![
            Cell::Text(row.name.clone().unwrap_or_else(|| t.no_category.to_owned())),
            money(row.price_cents.map(i64::from)),
            Cell::Int(row.tickets),
            Cell::Int(row.sold),
            Cell::Int(row.entries),
            money(row.amount_cents),
        ]);
    }
    let mut cash = vec![header(&t.ledger_sheet_headers)];
    for entry in &s.entries_list {
        cash.push(vec![
            Cell::Text(day_label(&entry.occurred_on)),
            Cell::Text(entry.description.clone()),
            entry.category.clone().map_or(Cell::Empty, Cell::Text),
            Cell::Text(
                match entry.kind {
                    LedgerKind::Income => t.income,
                    LedgerKind::Expense => t.expense,
                }
                .to_owned(),
            ),
            Cell::Money(match entry.kind {
                LedgerKind::Income => i64::from(entry.amount_cents),
                LedgerKind::Expense => -i64::from(entry.amount_cents),
            }),
        ]);
    }
    let mut sheets = vec![
        resumo,
        Sheet {
            name: t.by_seller.to_owned(),
            widths: vec![28, 10, 11, 10, 10, 14, 15, 15, 15],
            rows: sellers,
        },
    ];
    if !data.report.categories.is_empty() {
        sheets.push(Sheet {
            name: t.by_category.to_owned(),
            widths: vec![24, 14, 12, 12, 12, 16],
            rows: categories,
        });
    }
    sheets.push(Sheet {
        name: t.ledger_sheet.to_owned(),
        widths: vec![12, 40, 20, 12, 16],
        rows: cash,
    });
    Workbook { sheets }
}

fn attachment(name: &str, content_type: &'static str, bytes: Vec<u8>) -> Response {
    (
        [
            (CONTENT_TYPE, content_type.to_owned()),
            (
                CONTENT_DISPOSITION,
                format!("attachment; filename=\"{name}\""),
            ),
            (CACHE_CONTROL, "no-store".to_owned()),
        ],
        bytes,
    )
        .into_response()
}

fn base_name(event: &EventRow) -> String {
    let slug = crate::jobs::slug(&event.name);
    if slug.is_empty() {
        "prestacao-de-contas".to_owned()
    } else {
        format!("prestacao-de-contas-{slug}")
    }
}

/// `GET /api/events/{id}/accountability/pdf`.
pub async fn pdf(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Response> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    let data = accountability(&state, event).await?;
    let document = document(&data);
    let _permit = state
        .render_permits
        .clone()
        .acquire_owned()
        .await
        .map_err(anyhow::Error::from)?;
    let bytes = tokio::task::spawn_blocking(move || ticket_render::report_pdf(&document))
        .await
        .map_err(anyhow::Error::from)?
        .map_err(|error| ApiError::Internal(error.into()))?;
    Ok(attachment(
        &format!("{}.pdf", base_name(&data.event)),
        "application/pdf",
        bytes,
    ))
}

/// `GET /api/events/{id}/accountability/xlsx`.
pub async fn spreadsheet(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Response> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    let data = accountability(&state, event).await?;
    let sheets = workbook(&data);
    let bytes = tokio::task::spawn_blocking(move || ticket_render::xlsx(&sheets))
        .await
        .map_err(anyhow::Error::from)?
        .map_err(|error| ApiError::Internal(error.into()))?;
    Ok(attachment(
        &format!("{}.xlsx", base_name(&data.event)),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        bytes,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn amounts_read_like_brazilian_money() {
        assert_eq!(brl(0), "R$ 0,00");
        assert_eq!(brl(123_456_789), "R$ 1.234.567,89");
        assert_eq!(brl(-1_500), "-R$ 15,00");
        assert_eq!(whole(12_345), "12.345");
    }
}
