//! Certificates of participation (ADR 0113): for schools, talks and courses. Whoever came (a guest
//! of the list who arrived, or a ticket with a name that entered) gets a PDF with the event's
//! words, and a private link (`/certificado#token`) to open and download it. The token is the
//! certificate's id signed with the master key: never stored, always the same.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use base64::Engine as _;
use sqlx::PgPool;
use time::PrimitiveDateTime;
use uuid::Uuid;

use super::{EventRow, authorize_event, one_line, optional_text};
use crate::api::{
    CertificateNameBody, CertificateParticipantDto, CertificateSettingsDto, CertificateSignerDto,
    CertificateSource, CertificateTokenBody, CertificatesDto, IssuedCertificateDto,
    PublicCertificateDto,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::keys::{MasterKey, keyed_hash};
use crate::ratelimit;
use crate::state::AppState;
use crate::texts;

/// Bytes of the token's signature.
const TOKEN_MAC: usize = 12;
const TOKEN_PURPOSE: &str = "certificate-link";

/// The token of a certificate's link.
pub fn token(master: &MasterKey, id: Uuid) -> String {
    let mac = keyed_hash(master, TOKEN_PURPOSE, id.as_bytes());
    let mut bytes = id.as_bytes().to_vec();
    bytes.extend_from_slice(mac.get(..TOKEN_MAC).unwrap_or_default());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// The certificate of a token, when the signature holds.
pub fn certificate_of(master: &MasterKey, token: &str) -> Option<Uuid> {
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(token.trim())
        .ok()?;
    let (id, mac) = bytes.split_at_checked(16)?;
    let id = Uuid::from_slice(id).ok()?;
    let expected = keyed_hash(master, TOKEN_PURPOSE, id.as_bytes());
    let expected = expected.get(..TOKEN_MAC)?;
    // Constant time: the comparison never tells how much of a guess was right.
    (mac.len() == TOKEN_MAC
        && mac
            .iter()
            .zip(expected)
            .fold(0_u8, |diff, (a, b)| diff | (a ^ b))
            == 0)
        .then_some(id)
}

/// "CERT-0007".
pub fn code(number: i32) -> String {
    format!("CERT-{number:04}")
}

fn defaults() -> CertificateSettingsDto {
    CertificateSettingsDto {
        title: texts::CERTIFICATE_TITLE.to_owned(),
        body: texts::CERTIFICATE_BODY.to_owned(),
        workload: None,
        signers: Vec::new(),
        color: texts::CERTIFICATE_COLOR.to_owned(),
    }
}

/// The words of the event's certificates, and whether the organizer saved them.
async fn settings(pool: &PgPool, event_id: Uuid) -> ApiResult<(CertificateSettingsDto, bool)> {
    let Some(row) = sqlx::query!(
        r#"select title, body, workload, signer1_name, signer1_role, signer2_name, signer2_role, color
           from certificate_settings where event_id = $1"#,
        event_id
    )
    .fetch_optional(pool)
    .await?
    else {
        return Ok((defaults(), false));
    };
    let signers = [
        (row.signer1_name, row.signer1_role),
        (row.signer2_name, row.signer2_role),
    ]
    .into_iter()
    .filter_map(|(name, role)| name.map(|name| CertificateSignerDto { name, role }))
    .collect();
    Ok((
        CertificateSettingsDto {
            title: row.title,
            body: row.body,
            workload: row.workload,
            signers,
            color: row.color,
        },
        true,
    ))
}

fn checked_text(value: &str, max: usize, code: &'static str) -> ApiResult<String> {
    let text = value.trim().to_owned();
    if text.is_empty() || text.chars().count() > max {
        return Err(bad_request(code, format!("1 to {max} characters")));
    }
    Ok(text)
}

fn checked_line(
    value: Option<String>,
    max: usize,
    code: &'static str,
) -> ApiResult<Option<String>> {
    optional_text(value)
        .map(|text| {
            let text = checked_text(&text, max, code)?;
            one_line(&text, code)?;
            Ok(text)
        })
        .transpose()
}

/// `PUT /api/events/{id}/certificates/settings`.
pub async fn update_settings(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<CertificateSettingsDto>,
) -> ApiResult<Json<CertificatesDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let title = checked_text(&body.title, 60, "invalid_certificate_title")?;
    one_line(&title, "invalid_certificate_title")?;
    let text = checked_text(&body.body, 600, "invalid_certificate_body")?;
    let workload = checked_line(body.workload.clone(), 30, "invalid_certificate_workload")?;
    if body.signers.len() > 2 {
        return Err(bad_request(
            "invalid_certificate_signers",
            "up to two signers",
        ));
    }
    let mut signers = Vec::new();
    for signer in &body.signers {
        let name = checked_line(Some(signer.name.clone()), 60, "invalid_certificate_signers")?
            .ok_or_else(|| bad_request("invalid_certificate_signers", "a signer needs a name"))?;
        let role = checked_line(signer.role.clone(), 60, "invalid_certificate_signers")?;
        signers.push((name, role));
    }
    let color = body.color.trim().to_lowercase();
    if color.len() != 7
        || !color.starts_with('#')
        || !color.chars().skip(1).all(|c| c.is_ascii_hexdigit())
    {
        return Err(bad_request("invalid_color", "colour as #rrggbb"));
    }
    let signer = |index: usize| signers.get(index).cloned().unzip();
    let (signer1_name, signer1_role) = signer(0);
    let (signer2_name, signer2_role) = signer(1);
    sqlx::query!(
        r#"insert into certificate_settings
             (event_id, title, body, workload, signer1_name, signer1_role, signer2_name, signer2_role, color)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           on conflict (event_id) do update set
             title = excluded.title, body = excluded.body, workload = excluded.workload,
             signer1_name = excluded.signer1_name, signer1_role = excluded.signer1_role,
             signer2_name = excluded.signer2_name, signer2_role = excluded.signer2_role,
             color = excluded.color, updated_at = now()"#,
        event_id,
        title,
        text,
        workload,
        signer1_name,
        signer1_role.flatten(),
        signer2_name,
        signer2_role.flatten(),
        color,
    )
    .execute(&state.pool)
    .await?;
    Ok(Json(overview(&state, event_id).await?))
}

/// A person who came.
struct Participant {
    key: String,
    name: String,
    source: CertificateSource,
    guest_id: Option<Uuid>,
    ticket_number: Option<i32>,
    phone: Option<String>,
}

/// Everyone who came, by name: the guests of the list who arrived (not undone), and the tickets
/// that entered with a name (the holder's of a digital ticket, else the buyer's of a seller).
async fn participants(pool: &PgPool, event_id: Uuid) -> ApiResult<Vec<Participant>> {
    let mut people: Vec<Participant> = sqlx::query!(
        r#"select g.id, g.name from guest_list g
           where g.event_id = $1
             and exists (select 1 from guest_arrivals a where a.guest_id = g.id and a.undone_at is null)"#,
        event_id
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| Participant {
        key: format!("g:{}", row.id),
        name: row.name,
        source: CertificateSource::Guest,
        guest_id: Some(row.id),
        ticket_number: None,
        phone: None,
    })
    .collect();
    people.extend(
        sqlx::query!(
            r#"select e.ticket_number, coalesce(l.holder_name, s.buyer_name) as "name!", s.buyer_phone
               from entries e
               left join ticket_links l on l.event_id = e.event_id and l.ticket_number = e.ticket_number
                                       and l.revoked_at is null
               left join ticket_sales s on s.event_id = e.event_id and s.ticket_number = e.ticket_number
               where e.event_id = $1 and coalesce(l.holder_name, s.buyer_name) is not null"#,
            event_id
        )
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|row| Participant {
            key: format!("t:{}", row.ticket_number),
            name: row.name,
            source: CertificateSource::Ticket,
            guest_id: None,
            ticket_number: Some(row.ticket_number),
            phone: row.buyer_phone,
        }),
    );
    people.sort_by_key(|person| person.name.to_lowercase());
    Ok(people)
}

struct Issued {
    id: Uuid,
    number: i32,
    name: String,
    guest_id: Option<Uuid>,
    ticket_number: Option<i32>,
    open_count: i32,
}

async fn issued(pool: &PgPool, event_id: Uuid) -> ApiResult<Vec<Issued>> {
    Ok(sqlx::query_as!(
        Issued,
        r#"select id, number, name, guest_id, ticket_number, open_count
           from certificates where event_id = $1 order by number"#,
        event_id
    )
    .fetch_all(pool)
    .await?)
}

async fn overview(state: &AppState, event_id: Uuid) -> ApiResult<CertificatesDto> {
    let (settings, saved) = settings(&state.pool, event_id).await?;
    let people = participants(&state.pool, event_id).await?;
    let mut made: Vec<Issued> = issued(&state.pool, event_id).await?;
    let (prefix, digits) = super::tickets::number_style(state, event_id).await?;
    let dto = |certificate: &Issued| IssuedCertificateDto {
        id: certificate.id,
        code: code(certificate.number),
        token: token(&state.config.master_key, certificate.id),
        open_count: certificate.open_count,
    };
    let mut participants: Vec<CertificateParticipantDto> = people
        .into_iter()
        .map(|person| {
            let found = made.iter().position(|certificate| {
                (person.guest_id.is_some() && certificate.guest_id == person.guest_id)
                    || (person.ticket_number.is_some()
                        && certificate.ticket_number == person.ticket_number)
            });
            let certificate = found.map(|index| made.swap_remove(index));
            CertificateParticipantDto {
                key: person.key,
                name: certificate
                    .as_ref()
                    .map_or(person.name, |certificate| certificate.name.clone()),
                source: person.source,
                ticket: person
                    .ticket_number
                    .map(|number| format!("{prefix}{number:0width$}", width = usize::from(digits))),
                phone: person.phone,
                certificate: certificate.as_ref().map(dto),
            }
        })
        .collect();
    // Certificates of people who left the list (an arrival undone, a guest deleted) stay valid.
    made.sort_by_key(|certificate| certificate.number);
    participants.extend(made.iter().map(|certificate| CertificateParticipantDto {
        key: format!("c:{}", certificate.id),
        name: certificate.name.clone(),
        source: if certificate.ticket_number.is_some() {
            CertificateSource::Ticket
        } else {
            CertificateSource::Guest
        },
        ticket: None,
        phone: None,
        certificate: Some(dto(certificate)),
    }));
    Ok(CertificatesDto {
        settings,
        saved,
        participants,
    })
}

/// `GET /api/events/{id}/certificates`.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<CertificatesDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    Ok(Json(overview(&state, event_id).await?))
}

/// `POST /api/events/{id}/certificates/issue`: makes the certificates of everyone who came and has
/// none yet (again later for whoever arrives after).
pub async fn issue(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<CertificatesDto>> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    if event.tokens() {
        return Err(bad_request(
            "certificates_tokens",
            "consumption tokens have no certificates",
        ));
    }
    let people = participants(&state.pool, event_id).await?;
    let mut tx = state.pool.begin().await?;
    sqlx::query!("select id from events where id = $1 for update", event_id)
        .fetch_one(&mut *tx)
        .await?;
    let total = sqlx::query_scalar!(
        r#"select count(*) as "count!" from certificates where event_id = $1"#,
        event_id
    )
    .fetch_one(&mut *tx)
    .await?;
    let mut made = 0_i64;
    for person in people {
        if total + made >= i64::try_from(ticket_render::MAX_CERTIFICATES).unwrap_or(i64::MAX) {
            break;
        }
        let inserted = sqlx::query!(
            r#"insert into certificates (id, event_id, number, name, guest_id, ticket_number)
               select $1, $2, coalesce(max(number), 0) + 1, $3, $4, $5
               from certificates where event_id = $2
               on conflict do nothing"#,
            Uuid::new_v4(),
            event_id,
            person.name,
            person.guest_id,
            person.ticket_number,
        )
        .execute(&mut *tx)
        .await?
        .rows_affected();
        made += i64::try_from(inserted).unwrap_or(0);
    }
    tx.commit().await?;
    Ok(Json(overview(&state, event_id).await?))
}

async fn certificate_event(state: &AppState, user: &AuthUser, id: Uuid) -> ApiResult<Uuid> {
    let event_id = sqlx::query_scalar!("select event_id from certificates where id = $1", id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, user, event_id).await?;
    Ok(event_id)
}

/// `PUT /api/certificates/{id}`: the name printed (a typo in the list).
pub async fn rename(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CertificateNameBody>,
) -> ApiResult<Json<CertificatesDto>> {
    let event_id = certificate_event(&state, &user, id).await?;
    let name = checked_text(&body.name, 80, "invalid_certificate_name")?;
    one_line(&name, "invalid_certificate_name")?;
    sqlx::query!("update certificates set name = $2 where id = $1", id, name)
        .execute(&state.pool)
        .await?;
    Ok(Json(overview(&state, event_id).await?))
}

/// `DELETE /api/certificates/{id}`: the link stops working; making it again gives a new one.
pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    certificate_event(&state, &user, id).await?;
    sqlx::query!("delete from certificates where id = $1", id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// What every certificate of an event shares.
struct Shared {
    event: EventRow,
    settings: CertificateSettingsDto,
    days: Vec<PrimitiveDateTime>,
    organization: String,
}

async fn shared(state: &AppState, event: EventRow) -> ApiResult<Shared> {
    let (settings, _) = settings(&state.pool, event.id).await?;
    let offset = event.offset();
    let mut days: Vec<PrimitiveDateTime> =
        crate::event_days::of_event(&state.pool, event.id, offset)
            .await?
            .iter()
            .map(|day| {
                let local = day.starts_at.to_offset(offset);
                PrimitiveDateTime::new(local.date(), local.time())
            })
            .collect();
    if days.is_empty() {
        let local = event.starts_at.to_offset(offset);
        days.push(PrimitiveDateTime::new(local.date(), local.time()));
    }
    let organization = sqlx::query_scalar!(
        "select o.name from organizations o join events e on e.organization_id = o.id where e.id = $1",
        event.id
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(Shared {
        event,
        settings,
        days,
        organization,
    })
}

fn render_one(
    state: &AppState,
    shared: &Shared,
    name: &str,
    number: Option<i32>,
    id: Option<Uuid>,
) -> ticket_render::Certificate {
    let fields = ticket_render::CertificateFields {
        name: name.to_owned(),
        event: shared.event.name.clone(),
        days: shared.days.clone(),
        venue: shared.event.venue.clone(),
        organization: Some(shared.organization.clone()),
        workload: shared.settings.workload.clone(),
    };
    let check_url = id.map_or_else(
        || format!("{}/certificado", state.config.public_web_url),
        |id| {
            format!(
                "{}/certificado#{}",
                state.config.public_web_url,
                token(&state.config.master_key, id)
            )
        },
    );
    let date = ticket_render::fill_certificate("{dias}", &fields)
        .into_iter()
        .map(|segment| segment.text)
        .collect::<String>();
    ticket_render::Certificate {
        kicker: texts::CERTIFICATE_KICKER.to_owned(),
        title: shared.settings.title.clone(),
        body: ticket_render::fill_certificate(&shared.settings.body, &fields),
        workload_label: texts::CERTIFICATE_WORKLOAD.to_owned(),
        workload: shared.settings.workload.clone(),
        place: [shared.event.venue.clone(), Some(date)]
            .into_iter()
            .flatten()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join(" · "),
        signers: shared
            .settings
            .signers
            .iter()
            .map(|signer| ticket_render::CertificateSigner {
                name: signer.name.clone(),
                role: signer.role.clone(),
            })
            .collect(),
        color: shared.settings.color.clone(),
        code: number.map_or_else(String::new, |number| format!("Código {}", code(number))),
        check: texts::CERTIFICATE_CHECK.to_owned(),
        check_url,
    }
}

async fn render<T: Send + 'static>(
    state: &AppState,
    job: impl FnOnce() -> Result<T, ticket_render::RenderError> + Send + 'static,
) -> ApiResult<T> {
    let _permit = state
        .render_permits
        .clone()
        .acquire_owned()
        .await
        .map_err(anyhow::Error::from)?;
    tokio::task::spawn_blocking(job)
        .await
        .map_err(anyhow::Error::from)?
        .map_err(|error| ApiError::Internal(error.into()))
}

fn file_base(event: &EventRow) -> String {
    let slug = crate::jobs::slug(&event.name);
    if slug.is_empty() {
        "certificados".to_owned()
    } else {
        format!("certificados-{slug}")
    }
}

/// `GET /api/events/{id}/certificates/sample`: the words as they print, on a sample name.
pub async fn sample(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Response> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    let shared = shared(&state, event).await?;
    let certificate = render_one(&state, &shared, texts::CERTIFICATE_SAMPLE_NAME, None, None);
    let bytes = render(&state, move || ticket_render::certificate_pdf(&certificate)).await?;
    Ok(super::ledger::attachment(
        "certificado-exemplo.pdf",
        "application/pdf",
        bytes,
    ))
}

/// `GET /api/events/{id}/certificates/zip`: every certificate made, one PDF per person.
pub async fn zip(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Response> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    let made = issued(&state.pool, event_id).await?;
    if made.is_empty() {
        return Err(bad_request(
            "no_certificates",
            "make the certificates first",
        ));
    }
    let base = file_base(&event);
    let shared = shared(&state, event).await?;
    let items: Vec<(String, ticket_render::Certificate)> = made
        .iter()
        .map(|certificate| {
            let slug = crate::jobs::slug(&certificate.name);
            (
                format!("{}-{slug}.pdf", code(certificate.number)),
                render_one(
                    &state,
                    &shared,
                    &certificate.name,
                    Some(certificate.number),
                    Some(certificate.id),
                ),
            )
        })
        .collect();
    let bytes = render(&state, move || ticket_render::certificates_zip(&items)).await?;
    Ok(super::ledger::attachment(
        &format!("{base}.zip"),
        "application/zip",
        bytes,
    ))
}

/// The certificate of a public token, with its event.
async fn by_token(state: &AppState, token: &str) -> ApiResult<(Issued, EventRow)> {
    let id = certificate_of(&state.config.master_key, token).ok_or(ApiError::NotFound)?;
    let certificate = sqlx::query_as!(
        Issued,
        r#"select id, number, name, guest_id, ticket_number, open_count
           from certificates where id = $1"#,
        id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    let event_id = sqlx::query_scalar!("select event_id from certificates where id = $1", id)
        .fetch_one(&state.pool)
        .await?;
    let event = sqlx::query_as!(
        EventRow,
        r#"select id, name, venue, starts_at, ends_at, ticket_price_cents, status, qr_tag,
                  utc_offset_minutes, address, postponed_from_starts_at, postponed_at,
                  postpone_reason, canceled_at, cancel_reason, kind
           from events where id = $1"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    Ok((certificate, event))
}

/// `POST /api/certificates/view` (no login): what the private page shows.
pub async fn view(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CertificateTokenBody>,
) -> ApiResult<Json<PublicCertificateDto>> {
    ratelimit::by_ip(&state, &headers, ratelimit::CERTIFICATE).await?;
    let (certificate, event) = by_token(&state, &body.token).await?;
    sqlx::query!(
        r#"update certificates set open_count = open_count + 1,
                  first_opened_at = coalesce(first_opened_at, now())
           where id = $1"#,
        certificate.id
    )
    .execute(&state.pool)
    .await?;
    let shared = shared(&state, event).await?;
    let printed = render_one(&state, &shared, &certificate.name, None, None);
    let date = printed
        .place
        .rsplit(" · ")
        .next()
        .unwrap_or_default()
        .to_owned();
    Ok(Json(PublicCertificateDto {
        name: certificate.name,
        code: code(certificate.number),
        title: shared.settings.title,
        event: shared.event.name,
        date,
        venue: shared.event.venue,
        organization: Some(shared.organization),
        workload: shared.settings.workload,
    }))
}

/// `POST /api/certificates/pdf` (no login): the certificate itself.
pub async fn pdf(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CertificateTokenBody>,
) -> ApiResult<Response> {
    ratelimit::by_ip(&state, &headers, ratelimit::CERTIFICATE).await?;
    let (certificate, event) = by_token(&state, &body.token).await?;
    let shared = shared(&state, event).await?;
    let printed = render_one(
        &state,
        &shared,
        &certificate.name,
        Some(certificate.number),
        Some(certificate.id),
    );
    let bytes = render(&state, move || ticket_render::certificate_pdf(&printed)).await?;
    let slug = crate::jobs::slug(&certificate.name);
    Ok(super::ledger::attachment(
        &format!("certificado-{slug}.pdf"),
        "application/pdf",
        bytes,
    ))
}
