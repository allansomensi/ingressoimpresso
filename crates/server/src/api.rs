//! JSON request and response bodies. TypeScript types are generated from these structs into
//! `packages/api-types/src/generated/` (`cargo test -p ingressoimpresso-server --features ts`).
//!
//! Field names are `camelCase`, enum values `snake_case`, timestamps RFC 3339 strings.

use serde::{Deserialize, Serialize};
use ticket_render::TicketDesign;
use time::OffsetDateTime;
use uuid::Uuid;

macro_rules! dto {
    ($($item:item)*) => {
        $(
            #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
            #[serde(rename_all = "camelCase")]
            #[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export, export_to = "api-types/src/generated/"))]
            $item
        )*
    };
}

macro_rules! dto_enum {
    ($($item:item)*) => {
        $(
            #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
            #[serde(rename_all = "snake_case")]
            #[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export, export_to = "api-types/src/generated/"))]
            $item
        )*
    };
}

dto! {
    /// `POST /api/auth/code`.
    pub struct RequestCodeBody {
        /// E-mail that receives the code.
        pub email: String,
    }

    /// `POST /api/auth/verify`.
    pub struct VerifyCodeBody {
        /// Same e-mail as in the code request.
        pub email: String,
        /// The 6-digit code.
        pub code: String,
    }

    /// A new session.
    pub struct SessionResponse {
        /// Bearer token (ADR 0016). Shown once; the server keeps only its hash.
        pub token: String,
        /// The signed-in user.
        pub user: MeUser,
    }

    /// The signed-in user.
    pub struct MeUser {
        /// User id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// E-mail.
        pub email: String,
        /// May mark batches as paid (MVP, ADR 0014).
        pub is_admin: bool,
    }

    /// `POST /api/events` and `PUT /api/events/{id}`.
    pub struct EventBody {
        /// Event name (1–100 characters).
        pub name: String,
        /// Venue (optional, up to 120 characters).
        pub venue: Option<String>,
        /// Start.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// End (after start).
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub ends_at: OffsetDateTime,
        /// Ticket price in cents, for the seller settlement report.
        pub ticket_price_cents: Option<i32>,
    }

    /// An event.
    pub struct EventDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// Venue.
        pub venue: Option<String>,
        /// Start.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// End.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub ends_at: OffsetDateTime,
        /// Price in cents.
        pub ticket_price_cents: Option<i32>,
        /// Lifecycle.
        pub status: EventStatus,
    }

    /// Uploaded art.
    pub struct ArtDto {
        /// Blob id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// `image/png` or `image/jpeg`.
        pub content_type: String,
        /// Width in pixels.
        pub width_px: i32,
        /// Height in pixels.
        pub height_px: i32,
    }

    /// The current design of an event.
    pub struct DesignResponse {
        /// Version number; 0 means "not saved yet" (default design).
        pub version: i32,
        /// The design.
        pub design: TicketDesign,
        /// Art, if any.
        pub art: Option<ArtDto>,
    }

    /// `PUT /api/events/{id}/design` and `POST /api/events/{id}/design/preview`.
    pub struct DesignBody {
        /// The design.
        pub design: TicketDesign,
        /// Art uploaded to this event, if any.
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub art_id: Option<Uuid>,
    }

    /// `POST /api/events/{id}/batches`.
    pub struct CreateBatchBody {
        /// How many tickets (1–5000), numbered after the last batch.
        pub quantity: i32,
    }

    /// A batch of ticket numbers.
    pub struct BatchDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// First number.
        pub first: i32,
        /// Last number (inclusive).
        pub last: i32,
        /// Payment status.
        pub status: BatchStatus,
        /// Creation time.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// Payment time.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub paid_at: Option<OffsetDateTime>,
        /// What the batch costs, in centavos (ADR 0020), after its free tickets.
        pub price_cents: i32,
        /// Tickets of the batch that came from the organization's free allowance (ADR 0024).
        pub free_tickets: i32,
        /// How it was paid.
        pub paid_via: Option<PaymentMethod>,
        /// An unsettled online payment: a checkout page is open, or a Pix transfer is being
        /// confirmed. `null` when there is none.
        pub pending_payment: Option<PaymentState>,
    }

    /// One price tier: tickets up to `upTo` (counted within the batch) cost `unitCents` each.
    pub struct PriceTierDto {
        /// Last ticket of the tier.
        pub up_to: i32,
        /// Price per ticket, in centavos.
        pub unit_cents: i32,
    }

    /// `GET /api/pricing`: graduated price table of batches.
    pub struct PricingDto {
        /// Lowercase ISO 4217 currency (`brl`).
        pub currency: String,
        /// Smallest charge, in centavos.
        pub minimum_cents: i32,
        /// Tiers in increasing order.
        pub tiers: Vec<PriceTierDto>,
        /// Whether batches can be paid online (Stripe configured).
        pub online_payment: bool,
        /// Free tickets every organization gets (taken off its first batches).
        pub free_tickets: i32,
    }

    /// `GET /api/account`: the signed-in user's organization.
    pub struct AccountDto {
        /// Organization name.
        pub organization_name: String,
        /// Free tickets still available to the organization.
        pub free_tickets_left: i32,
        /// Free tickets of the organization: everyone's allowance plus any bonus from an admin.
        pub free_tickets_total: i32,
        /// Events of the organization.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub event_count: i64,
        /// Paid tickets issued by the organization.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub paid_tickets: i64,
    }

    /// `PUT /api/account`.
    pub struct AccountBody {
        /// New organization name (1–100 characters).
        pub organization_name: String,
    }

    /// `GET /api/admin/overview`: totals of the whole service (admins only, ADR 0026).
    pub struct AdminOverviewDto {
        /// Organizations.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub organizations: i64,
        /// Organizations created in the last 30 days.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub new_organizations: i64,
        /// Users.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub users: i64,
        /// Events.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub events: i64,
        /// Events that have not ended yet.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub upcoming_events: i64,
        /// Tickets of paid batches (free ones included).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub paid_tickets: i64,
        /// Tickets given from free allowances.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub free_tickets: i64,
        /// Money of paid batches, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revenue_cents: i64,
        /// Money of batches paid in the last 30 days.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revenue_30d_cents: i64,
        /// Batches waiting for payment.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub awaiting_batches: i64,
        /// Pix generated and not yet confirmed.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub processing_payments: i64,
        /// The last 30 days, oldest first (Brasília dates).
        pub days: Vec<AdminDayDto>,
    }

    /// One day of the admin overview.
    pub struct AdminDayDto {
        /// `YYYY-MM-DD`.
        pub date: String,
        /// Tickets of batches paid that day.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub tickets: i64,
        /// Money of batches paid that day, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revenue_cents: i64,
        /// Organizations created that day.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub signups: i64,
    }

    /// An organization as admins see it.
    pub struct AdminOrganizationDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// E-mail of the first owner.
        pub owner_email: Option<String>,
        /// Creation time.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// Events.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub event_count: i64,
        /// Tickets of paid batches.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub paid_tickets: i64,
        /// Money of paid batches, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revenue_cents: i64,
        /// Free tickets used.
        pub free_used: i32,
        /// Free tickets granted: everyone's allowance plus the bonus.
        pub free_total: i32,
        /// Extra free tickets given by an admin.
        pub bonus_free_tickets: i32,
        /// Last batch created.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub last_batch_at: Option<OffsetDateTime>,
    }

    /// `PUT /api/admin/organizations/{id}/bonus`.
    pub struct AdminBonusBody {
        /// Extra free tickets (0–100000), replacing the current bonus.
        pub bonus_free_tickets: i32,
    }

    /// A batch of any organization, as admins see it.
    pub struct AdminBatchDto {
        /// The batch.
        pub batch: BatchDto,
        /// Event id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub event_id: Uuid,
        /// Event name.
        pub event_name: String,
        /// Organization name.
        pub organization_name: String,
        /// E-mail of the organization's first owner.
        pub owner_email: Option<String>,
    }

    /// `POST /api/batches/{id}/checkout`: the Stripe payment page.
    pub struct CheckoutDto {
        /// Where to send the browser.
        pub url: String,
    }

    /// `POST /api/events/{id}/sellers` and `PUT /api/sellers/{id}`.
    pub struct SellerBody {
        /// Name (1–60 characters, unique per event).
        pub name: String,
        /// Phone (optional).
        pub phone: Option<String>,
    }

    /// A seller with the ranges they hold.
    pub struct SellerDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// Phone.
        pub phone: Option<String>,
        /// Assigned ranges, ordered.
        pub ranges: Vec<RangeDto>,
    }

    /// An inclusive range of ticket numbers.
    pub struct RangeBody {
        /// First number.
        pub first: i32,
        /// Last number (inclusive).
        pub last: i32,
    }

    /// An assigned range.
    pub struct RangeDto {
        /// Assignment id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// First number.
        pub first: i32,
        /// Last number (inclusive).
        pub last: i32,
    }

    /// `POST /api/events/{id}/voids`.
    pub struct CreateVoidBody {
        /// First number.
        pub first: i32,
        /// Last number (inclusive).
        pub last: i32,
        /// Why.
        pub reason: VoidReason,
        /// Free note (up to 200 characters).
        pub note: Option<String>,
    }

    /// A voided range.
    pub struct VoidDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// First number.
        pub first: i32,
        /// Last number (inclusive).
        pub last: i32,
        /// Why.
        pub reason: VoidReason,
        /// Note.
        pub note: Option<String>,
        /// When.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// When it was undone, if it was.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub undone_at: Option<OffsetDateTime>,
    }

    /// `POST /api/events/{id}/exports`.
    pub struct CreateExportBody {
        /// File to generate.
        pub kind: ExportKind,
        /// Which tickets.
        pub scope: ExportScope,
        /// Print-shop file: draw crop marks (default true).
        pub crop_marks: Option<bool>,
    }

    /// An export (generated file).
    pub struct ExportDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// File type.
        pub kind: ExportKind,
        /// Which tickets.
        pub scope: ExportScope,
        /// Progress.
        pub status: ExportStatus,
        /// Tickets in the file (when done).
        pub ticket_count: Option<i32>,
        /// Suggested file name (when done).
        pub file_name: Option<String>,
        /// Size in bytes (when done).
        pub byte_size: Option<i64>,
        /// Error code (when failed).
        pub error: Option<String>,
        /// Requested at.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// A short-lived download link (ADR 0016).
    pub struct DownloadLinkDto {
        /// Absolute URL; works without authentication until `expiresAt`.
        pub url: String,
        /// Expiry.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub expires_at: OffsetDateTime,
    }

    /// `POST /api/events/{id}/door/accesses`.
    pub struct CreateDoorAccessBody {
        /// Who the link is for, e.g. "Equipe da porta" (1–60 characters).
        pub label: String,
    }

    /// A door access link (ADR 0007). The token itself is shown only once, at creation.
    pub struct DoorAccessDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Label.
        pub label: String,
        /// The link stops working at the end of the event plus 12 hours.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub expires_at: OffsetDateTime,
        /// When it was revoked, if it was.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub revoked_at: Option<OffsetDateTime>,
        /// Created at.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// A new access link with its token (never retrievable again).
    pub struct CreatedDoorAccess {
        /// The link.
        pub access: DoorAccessDto,
        /// Secret token; the painel builds `/portaria/#acesso=<token>` with it.
        pub token: String,
    }

    /// A registered door phone, as the organizer sees it.
    pub struct DoorDeviceDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Access link it registered with.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub access_id: Uuid,
        /// Name given at registration, e.g. "Porta 1 - João".
        pub name: String,
        /// Registered at.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// Last contact with the server.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub last_seen_at: Option<OffsetDateTime>,
        /// When it was revoked, if it was.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub revoked_at: Option<OffsetDateTime>,
        /// Scans received from it.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub scan_count: i64,
    }

    /// `GET /api/events/{id}/door`.
    pub struct DoorOverviewDto {
        /// Access links, newest first.
        pub accesses: Vec<DoorAccessDto>,
        /// Registered phones, newest first.
        pub devices: Vec<DoorDeviceDto>,
        /// Tickets that entered.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entry_count: i64,
    }

    /// `POST /api/door/register`.
    pub struct DoorRegisterBody {
        /// Token from the link fragment.
        pub access_token: String,
        /// Phone name shown in results, e.g. "Porta 1 - João" (1–40 characters).
        pub device_name: String,
    }

    /// A registered phone's credentials.
    pub struct DoorRegistration {
        /// Device id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub device_id: Uuid,
        /// Device name.
        pub device_name: String,
        /// Bearer secret of the door API; stored on the phone only.
        pub device_secret: String,
        /// The event.
        pub event: DoorEventInfo,
    }

    /// The event as the door shows it.
    pub struct DoorEventInfo {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// Venue.
        pub venue: Option<String>,
        /// Start.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// End.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub ends_at: OffsetDateTime,
        /// Digits of printed numbers (zero padded).
        pub number_digits: u8,
    }

    /// What `DoorCore` needs to verify tickets; same shape as ticket-core's `DoorEventDto`.
    pub struct DoorVerifierDto {
        /// Event UUID, hyphenated.
        pub event_id: String,
        /// Event tag printed in the QR.
        pub event_tag: u32,
        /// Every key of the event, revoked ones included.
        pub keys: Vec<DoorKeyDto>,
    }

    /// A public key; same shape as ticket-core's `EventKeyDto`.
    pub struct DoorKeyDto {
        /// Key generation.
        pub key_id: u8,
        /// Ed25519 public key, 64 lowercase hex characters.
        pub public_key: String,
        /// Lifecycle.
        pub status: KeyStatus,
    }

    /// A voided range; same shape as ticket-core's `VoidRangeDto`.
    pub struct DoorVoidDto {
        /// First number.
        pub first: u32,
        /// Last number (inclusive).
        pub last: u32,
        /// Why.
        pub reason: VoidReason,
    }

    /// A seller's range, to show who sold a ticket.
    pub struct DoorSellerRangeDto {
        /// Seller name.
        pub seller: String,
        /// First number.
        pub first: u32,
        /// Last number (inclusive).
        pub last: u32,
    }

    /// An admitted scan of any phone; same fields as ticket-core's `EntryDto` plus its id.
    pub struct DoorEntryDto {
        /// Scan id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub scan_id: Uuid,
        /// Ticket number.
        pub number: u32,
        /// Unix milliseconds (phone clock corrected by the server offset).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub at_unix_ms: i64,
        /// Name of the phone that scanned it.
        pub device_name: String,
    }

    /// `GET /api/door/manifest?since=<cursor>`: everything needed to decide offline.
    pub struct DoorManifest {
        /// This phone.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub device_id: Uuid,
        /// This phone's name.
        pub device_name: String,
        /// The event.
        pub event: DoorEventInfo,
        /// Verification keys.
        pub verifier: DoorVerifierDto,
        /// Every active void (sent whole: small).
        pub voids: Vec<DoorVoidDto>,
        /// Every seller range (sent whole: small).
        pub sellers: Vec<DoorSellerRangeDto>,
        /// Admitted scans since `since`, from every phone.
        pub entries: Vec<DoorEntryDto>,
        /// Opaque cursor for the next call.
        pub cursor: String,
        /// Server clock, Unix milliseconds.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub server_time_ms: i64,
    }

    /// One scan uploaded by a phone.
    pub struct DoorScanUpload {
        /// Generated on the phone (uploads are idempotent).
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Ticket number, when the QR was authentic.
        pub number: Option<u32>,
        /// Key generation, when the QR was authentic.
        pub key_id: Option<u8>,
        /// Decision shown on the phone.
        pub outcome: ScanOutcome,
        /// Unix milliseconds (phone clock corrected by the server offset).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub scanned_at_ms: i64,
    }

    /// `POST /api/door/scans`.
    pub struct DoorScansBody {
        /// Up to 500 scans.
        pub scans: Vec<DoorScanUpload>,
        /// Online confirmation of a single fresh scan (ADR 0006): its result decides the screen.
        #[serde(default)]
        pub confirm: bool,
    }

    /// Server view of an uploaded scan.
    pub struct DoorScanResult {
        /// Scan id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// For admitted scans: first entry, duplicate or voided ticket.
        pub class: Option<ScanClass>,
        /// For duplicates: the first entry.
        pub first_entry: Option<DoorFirstEntryDto>,
        /// For voided tickets: why.
        pub void_reason: Option<VoidReason>,
    }

    /// When and where a ticket first entered.
    pub struct DoorFirstEntryDto {
        /// Unix milliseconds.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub at_unix_ms: i64,
        /// Phone name.
        pub device_name: String,
    }

    /// `POST /api/door/scans` response, in request order.
    pub struct DoorScansResponse {
        /// One result per uploaded scan.
        pub results: Vec<DoorScanResult>,
    }

    /// One line of the report: a seller, the unassigned tickets or the totals.
    pub struct ReportRowDto {
        /// Seller id; `null` for unassigned tickets and totals.
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub seller_id: Option<Uuid>,
        /// Seller name; `null` for unassigned tickets and totals.
        pub seller: Option<String>,
        /// Paid tickets in the line (assigned to the seller, or unassigned).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub tickets: i64,
        /// Voided as returned unsold.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub unsold: i64,
        /// Voided as lost or stolen.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub lost: i64,
        /// Voided for another reason.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revoked: i64,
        /// Declared sold: tickets − unsold − lost.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub declared_sold: i64,
        /// Tickets that entered.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
        /// Copies that entered through phones offline (found on sync).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub offline_duplicates: i64,
        /// Copies stopped at the door (locally or by the online confirmation).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub blocked_copies: i64,
        /// Voided tickets that entered (the phone did not know about the void yet).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub void_entries: i64,
        /// Declared sold × ticket price, when the event has a price.
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub amount_due_cents: Option<i64>,
    }

    /// What one door phone did.
    pub struct ReportDeviceDto {
        /// Phone name.
        pub name: String,
        /// Every scan.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub scans: i64,
        /// First entries recorded by this phone.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub first_entries: i64,
        /// Copies it let in while offline.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub offline_duplicates: i64,
        /// Copies it stopped.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub blocked_copies: i64,
        /// Forged, damaged or foreign QR codes read.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub invalid: i64,
    }

    /// `GET /api/events/{id}/report`: settlement per seller and door activity.
    pub struct EventReportDto {
        /// Ticket price used for the amounts.
        pub ticket_price_cents: Option<i32>,
        /// One line per seller, in name order (sellers without tickets included).
        pub sellers: Vec<ReportRowDto>,
        /// Paid tickets without a seller.
        pub unassigned: ReportRowDto,
        /// Sum of every line.
        pub totals: ReportRowDto,
        /// Door phones, in name order.
        pub devices: Vec<ReportDeviceDto>,
        /// Scans of forged, damaged or unknown QR codes.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub invalid_scans: i64,
        /// Scans of tickets of other events.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub other_event_scans: i64,
        /// When the report was computed.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub generated_at: OffsetDateTime,
    }
}

dto_enum! {
    /// Event lifecycle.
    pub enum EventStatus {
        /// Open.
        Active,
        /// Finished.
        Closed,
    }

    /// Batch payment status.
    pub enum BatchStatus {
        /// Waiting for payment (no ticket is signed).
        AwaitingPayment,
        /// Paid: tickets can be generated.
        Paid,
        /// Canceled before payment.
        Canceled,
    }

    /// How a batch was paid.
    pub enum PaymentMethod {
        /// Online, through Stripe Checkout.
        Stripe,
        /// Marked as paid by an admin.
        Admin,
        /// Entirely covered by the organization's free tickets.
        Free,
    }

    /// An unsettled online payment of a batch.
    pub enum PaymentState {
        /// The Stripe payment page is open.
        Open,
        /// Paid by Pix, waiting for Stripe to confirm the transfer.
        Processing,
    }

    /// Why a range was voided.
    pub enum VoidReason {
        /// Returned unsold.
        Unsold,
        /// Lost or stolen.
        Lost,
        /// Any other reason.
        Revoked,
    }

    /// Generated file type.
    pub enum ExportKind {
        /// A4 sheets for home printing.
        Home,
        /// Print-shop PDF with bleed.
        Print,
        /// Control sheet per seller.
        Control,
        /// WhatsApp images (ZIP).
        Whatsapp,
    }

    /// Export progress.
    pub enum ExportStatus {
        /// Waiting for the worker.
        Queued,
        /// Being generated.
        Running,
        /// Ready to download.
        Done,
        /// Failed (see `error`).
        Failed,
    }

    /// Signing key lifecycle.
    pub enum KeyStatus {
        /// Signs new batches.
        Active,
        /// No longer signs; its tickets stay valid.
        Retired,
        /// Compromised; its tickets are rejected.
        Revoked,
    }

    /// Decision shown on the phone for a scan.
    pub enum ScanOutcome {
        /// Green: entered.
        Admitted,
        /// Red: already entered.
        RejectedUsed,
        /// Red: voided ticket.
        RejectedVoid,
        /// Red: forged, damaged or not ours.
        RejectedInvalid,
        /// Yellow: ticket of another event.
        RejectedOtherEvent,
    }

    /// Server classification of an admitted scan.
    pub enum ScanClass {
        /// First entry of the ticket.
        FirstEntry,
        /// The ticket had already entered (a copy).
        DuplicateEntry,
        /// The ticket is voided.
        VoidEntry,
    }
}

/// Which tickets an export contains. Always only paid, non-voided tickets.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(
    feature = "ts",
    derive(ts_rs::TS),
    ts(export, export_to = "api-types/src/generated/")
)]
pub enum ExportScope {
    /// Every paid ticket of the event.
    All,
    /// One batch.
    Batch {
        /// Batch id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        batch_id: Uuid,
    },
    /// One seller's ranges.
    Seller {
        /// Seller id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        seller_id: Uuid,
    },
}

macro_rules! db_enum {
    ($ty:ty { $($variant:ident => $text:literal),* $(,)? }) => {
        impl $ty {
            /// Database value.
            pub const fn db(self) -> &'static str {
                match self { $(Self::$variant => $text),* }
            }

            /// Parses a database value.
            pub fn from_db(value: &str) -> Option<Self> {
                match value { $($text => Some(Self::$variant),)* _ => None }
            }
        }
    };
}

db_enum!(EventStatus { Active => "active", Closed => "closed" });
db_enum!(BatchStatus { AwaitingPayment => "awaiting_payment", Paid => "paid", Canceled => "canceled" });
db_enum!(PaymentMethod { Stripe => "stripe", Admin => "admin", Free => "free" });
db_enum!(PaymentState { Open => "open", Processing => "processing" });
db_enum!(VoidReason { Unsold => "unsold", Lost => "lost", Revoked => "revoked" });
db_enum!(ExportKind { Home => "home", Print => "print", Control => "control", Whatsapp => "whatsapp" });
db_enum!(ExportStatus { Queued => "queued", Running => "running", Done => "done", Failed => "failed" });
db_enum!(KeyStatus { Active => "active", Retired => "retired", Revoked => "revoked" });
db_enum!(ScanOutcome {
    Admitted => "admitted",
    RejectedUsed => "rejected_used",
    RejectedVoid => "rejected_void",
    RejectedInvalid => "rejected_invalid",
    RejectedOtherEvent => "rejected_other_event",
});
db_enum!(ScanClass { FirstEntry => "first_entry", DuplicateEntry => "duplicate_entry", VoidEntry => "void_entry" });
