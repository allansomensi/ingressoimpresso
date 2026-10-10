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
        /// Token of the anti-bot widget (ADR 0044); required when `captchaSiteKey` is set.
        #[serde(default)]
        #[cfg_attr(feature = "ts", ts(optional))]
        pub captcha_token: Option<String>,
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
        /// Name shared by Google, if any.
        pub name: Option<String>,
        /// In `ADMIN_EMAILS`: the admin panel and every organization (ADRs 0026, 0032).
        pub is_admin: bool,
        /// Signs in with Google too (ADR 0029).
        pub google: bool,
        /// The organization is suspended: the panel only reads (ADR 0032).
        pub suspended: bool,
    }

    /// `GET /api/auth/options`: how this server lets people sign in.
    pub struct AuthOptionsDto {
        /// OAuth client id of "Entrar com Google"; `null` when it is off.
        pub google_client_id: Option<String>,
        /// Cloudflare Turnstile site key (ADR 0044): when set, asking for a code needs the
        /// widget's token.
        pub captcha_site_key: Option<String>,
    }

    /// `POST /api/auth/google`.
    pub struct GoogleSignInBody {
        /// ID token (JWT) from Google Identity Services.
        pub credential: String,
    }

    /// `DELETE /api/account`.
    pub struct DeleteAccountBody {
        /// The account's e-mail, typed as confirmation.
        pub email: String,
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

    /// `PUT /api/events/{id}/status`: archive (`closed`) or reopen (`active`).
    pub struct EventStatusBody {
        /// New lifecycle state.
        pub status: EventStatus,
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
        /// Opened by an admin outside their own organization (support mode, ADR 0032).
        pub support_access: bool,
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
        /// Moderation (ADR 0042): `unchecked`, `clean`, `flagged` (printing waits for the
        /// team), `approved` or `rejected` (never printed).
        pub moderation: String,
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
        /// Price of the table before discounts and credit (ADR 0039); `null` for older batches.
        pub list_price_cents: Option<i32>,
        /// Discount of a promotion or code, in centavos.
        pub discount_cents: i32,
        /// Credit of the organization used, in centavos (ADR 0040).
        pub credit_cents: i32,
        /// How it was paid.
        pub paid_via: Option<PaymentMethod>,
        /// When an admin refunded it (its numbers are voided for good).
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub refunded_at: Option<OffsetDateTime>,
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
        /// Promotion running now (ADR 0039).
        pub promotion: Option<ActivePromotionDto>,
        /// Announced table that starts later.
        pub upcoming: Option<UpcomingPricesDto>,
    }

    /// A price table announced for later (ADR 0039).
    pub struct UpcomingPricesDto {
        /// When it starts.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub effective_at: OffsetDateTime,
        /// Smallest charge.
        pub minimum_cents: i32,
        /// Tiers.
        pub tiers: Vec<PriceTierDto>,
        /// Free tickets of every organization.
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
        /// Credit of the organization, in centavos (ADR 0040).
        pub credit_cents: i32,
        /// Events of the organization.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub event_count: i64,
        /// Paid tickets issued by the organization.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub paid_tickets: i64,
        /// Why an admin suspended the organization, if it is suspended.
        pub suspended_reason: Option<String>,
        /// When the account accepted the current terms.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub terms_accepted_at: Option<OffsetDateTime>,
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
        /// Suspended by an admin.
        pub suspended: bool,
    }

    /// `GET /api/admin/organizations/{id}`: one account for support.
    pub struct AdminOrganizationDetailDto {
        /// Usage summary.
        pub organization: AdminOrganizationDto,
        /// When it was suspended, if it is.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub suspended_at: Option<OffsetDateTime>,
        /// Why.
        pub suspended_reason: Option<String>,
        /// People of the organization.
        pub members: Vec<AdminMemberDto>,
        /// Events, newest first.
        pub events: Vec<AdminEventDto>,
        /// Latest admin actions on this organization.
        pub audit: Vec<AuditEntryDto>,
    }

    /// A member of an organization, as admins see it.
    pub struct AdminMemberDto {
        /// User id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub user_id: Uuid,
        /// E-mail.
        pub email: String,
        /// Name shared by Google.
        pub name: Option<String>,
        /// `owner` or `member`.
        pub role: String,
        /// Account created at.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// Last sign-in.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub last_login_at: Option<OffsetDateTime>,
        /// Signs in with Google.
        pub google: bool,
        /// Open sessions.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub sessions: i64,
    }

    /// An event in the admin view of an organization.
    pub struct AdminEventDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// Start.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// `active` or `closed`.
        pub status: String,
        /// Tickets of paid batches.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub paid_tickets: i64,
        /// Money of paid batches, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revenue_cents: i64,
        /// Tickets that entered.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
    }

    /// One line of the audit log (ADR 0032).
    pub struct AuditEntryDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Admin who acted.
        pub actor_email: String,
        /// What, e.g. `batch_refund` or `support_write`.
        pub action: String,
        /// Organization concerned.
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub organization_id: Option<Uuid>,
        /// Its name.
        pub organization_name: Option<String>,
        /// Event concerned.
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub event_id: Option<Uuid>,
        /// Its name.
        pub event_name: Option<String>,
        /// Batch, user or note concerned.
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub target_id: Option<Uuid>,
        /// Details (amounts, the request path...).
        #[cfg_attr(feature = "ts", ts(type = "Record<string, unknown>"))]
        pub detail: serde_json::Value,
        /// When.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// `PUT /api/admin/organizations/{id}/suspension`.
    pub struct AdminSuspensionBody {
        /// Suspend (`true`) or lift (`false`).
        pub suspended: bool,
        /// Why (shown to the organization, up to 200 characters).
        pub reason: Option<String>,
    }

    /// `PUT /api/admin/organizations/{id}`.
    pub struct AdminRenameBody {
        /// New name (1–100 characters).
        pub name: String,
    }

    /// `POST /api/admin/batches/{id}/refund`.
    pub struct AdminRefundBody {
        /// Refund the payment on Stripe too (batches paid online); otherwise only record it.
        pub refund_on_stripe: bool,
        /// Note for the log (up to 200 characters).
        pub note: Option<String>,
    }

    /// `PUT /api/admin/batches/{id}/price`.
    pub struct AdminBatchPriceBody {
        /// New price in centavos; 0 frees the batch.
        pub price_cents: i32,
    }

    /// `GET /api/admin/finance?days=`: the service's revenue (ADR 0034).
    pub struct AdminFinanceDto {
        /// Length of the period.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub days: i64,
        /// Batches paid in the period, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revenue_cents: i64,
        /// Same, in the period before.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub previous_revenue_cents: i64,
        /// Refunded in the period.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub refunds_cents: i64,
        /// Batches refunded in the period.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub refunded_batches: i64,
        /// Revenue minus refunds.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub net_cents: i64,
        /// Batches that cost money, paid in the period.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub charged_batches: i64,
        /// Tickets charged (free ones excluded).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub charged_tickets: i64,
        /// Revenue per charged batch.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub average_batch_cents: i64,
        /// Batches waiting for payment now.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub pending_batches: i64,
        /// Their value.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub pending_cents: i64,
        /// Batches of the period by how they were paid.
        pub methods: Vec<AdminMethodDto>,
        /// Whether `series` is by month (a year) or by day.
        pub monthly: bool,
        /// Revenue over the period, oldest first.
        pub series: Vec<AdminSeriesPointDto>,
        /// Organizations that paid the most in the period.
        pub top_organizations: Vec<AdminTopOrganizationDto>,
        /// Organizations created in the period...
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub signups: i64,
        /// ...that created an event...
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub signups_with_event: i64,
        /// ...that got tickets (free ones count)...
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub signups_with_tickets: i64,
        /// ...and that paid for a batch.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub signups_paying: i64,
    }

    /// Batches of a payment method.
    pub struct AdminMethodDto {
        /// How they were paid.
        pub method: PaymentMethod,
        /// Batches.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub batches: i64,
        /// Tickets.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub tickets: i64,
        /// Money, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revenue_cents: i64,
    }

    /// One day or month of the finance chart.
    pub struct AdminSeriesPointDto {
        /// `YYYY-MM-DD` or `YYYY-MM` (Brasília).
        pub label: String,
        /// Money of batches paid, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revenue_cents: i64,
        /// Tickets of batches paid.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub tickets: i64,
        /// Batches paid.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub batches: i64,
    }

    /// An organization among those that paid the most.
    pub struct AdminTopOrganizationDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// Money paid in the period, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revenue_cents: i64,
        /// Tickets bought in the period.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub tickets: i64,
    }

    /// A changelog note (ADR 0031).
    pub struct ChangelogEntryDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// New, improvement, fix or security.
        pub kind: ChangelogKind,
        /// Title.
        pub title: String,
        /// Text (paragraphs separated by blank lines).
        pub body: String,
        /// Publication time; `null` for a draft.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub published_at: Option<OffsetDateTime>,
        /// Created at.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// Last edit.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub updated_at: OffsetDateTime,
    }

    /// `POST /api/admin/changelog` and `PUT /api/admin/changelog/{id}`.
    pub struct ChangelogBody {
        /// New, improvement, fix or security.
        pub kind: ChangelogKind,
        /// Title (1–120 characters).
        pub title: String,
        /// Text (up to 4000 characters).
        pub body: String,
        /// Published (`false`: draft).
        pub published: bool,
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

    /// `POST /api/events/{id}/tickets`: a digital ticket link (ADR 0030).
    pub struct CreateTicketLinkBody {
        /// Ticket number; `null` takes the next free paid number.
        pub number: Option<i32>,
        /// Who receives it (optional, up to 80 characters).
        pub holder_name: Option<String>,
    }

    /// `POST /api/events/{id}/tickets/bulk`: links for a range (up to 500 numbers).
    pub struct CreateTicketLinksBody {
        /// First number.
        pub first: i32,
        /// Last number (inclusive).
        pub last: i32,
    }

    /// `PUT /api/ticket-links/{id}`.
    pub struct UpdateTicketLinkBody {
        /// Who receives it; `null` clears it.
        pub holder_name: Option<String>,
    }

    /// A digital ticket link, as the organizer sees it.
    pub struct TicketLinkDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Ticket number.
        pub number: i32,
        /// Number as printed (zero padded).
        pub number_label: String,
        /// Who receives it.
        pub holder_name: Option<String>,
        /// The link to send (`/ingresso#<token>`).
        pub url: String,
        /// Created at.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// When it was revoked, if it was.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub revoked_at: Option<OffsetDateTime>,
        /// First time the holder opened it.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub first_opened_at: Option<OffsetDateTime>,
        /// Last time it was opened.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub last_opened_at: Option<OffsetDateTime>,
        /// How many times it was opened.
        pub open_count: i32,
        /// Valid, voided or already used at the door.
        pub state: TicketState,
        /// When the ticket entered.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub entered_at: Option<OffsetDateTime>,
    }

    /// `GET /api/events/{id}/tickets`.
    pub struct TicketLinksDto {
        /// Every link, active first.
        pub links: Vec<TicketLinkDto>,
        /// Smallest paid number with no seller, void, link or entry.
        pub next_number: Option<i32>,
        /// Paid tickets of the event.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub paid_tickets: i64,
        /// Digits of printed numbers.
        pub number_digits: u8,
    }

    /// `POST /api/ticket` and `POST /api/ticket/image` (no login).
    pub struct OpenTicketBody {
        /// Token from the link's fragment.
        pub token: String,
    }

    /// What the holder's phone shows.
    pub struct TicketPassDto {
        /// The event.
        pub event: TicketPassEvent,
        /// Ticket number.
        pub number: i32,
        /// Number as printed.
        pub number_label: String,
        /// Text before the number on paper, e.g. "Nº ".
        pub number_prefix: String,
        /// Who it was sent to.
        pub holder_name: Option<String>,
        /// The signed QR text; `null` when the ticket is voided.
        pub qr_text: Option<String>,
        /// Valid, voided or used.
        pub state: TicketState,
        /// When it entered.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub entered_at: Option<OffsetDateTime>,
        /// Background colour of the ticket design (`#rrggbb`).
        pub background_color: String,
    }

    /// The event on a digital ticket.
    pub struct TicketPassEvent {
        /// Name.
        pub name: String,
        /// Venue.
        pub venue: Option<String>,
        /// Start, with the event's offset.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// End.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub ends_at: OffsetDateTime,
        /// Organization name.
        pub organizer: String,
    }

    /// `GET /api/analytics`: results of every event of the organization (ADR 0034).
    pub struct OrgAnalyticsDto {
        /// Sums.
        pub totals: ResultTotalsDto,
        /// One line per event, newest first.
        pub events: Vec<EventResultDto>,
        /// The last twelve months by event start, oldest first.
        pub months: Vec<MonthResultDto>,
    }

    /// Sums of the organization.
    #[derive(Default)]
    pub struct ResultTotalsDto {
        /// Events.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub events: i64,
        /// Paid tickets.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub paid_tickets: i64,
        /// Declared sold.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub sold: i64,
        /// Entries.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
        /// Sold × price, in centavos (events with a price).
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub gross_cents: i64,
        /// Paid for batches, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub cost_cents: i64,
        /// Gross minus cost.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub net_cents: i64,
    }

    /// One event's results.
    pub struct EventResultDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// Start, with the event's offset.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// `active` or `closed`.
        pub status: String,
        /// Ticket price.
        pub ticket_price_cents: Option<i32>,
        /// Paid tickets.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub paid_tickets: i64,
        /// Declared sold.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub sold: i64,
        /// Entries.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
        /// Sold × price.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub gross_cents: i64,
        /// Paid for batches.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub cost_cents: i64,
    }

    /// One month of the organization's results.
    #[derive(Default)]
    pub struct MonthResultDto {
        /// `YYYY-MM`.
        pub month: String,
        /// Events starting that month.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub events: i64,
        /// Declared sold.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub sold: i64,
        /// Entries.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
        /// Sold × price.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub gross_cents: i64,
        /// Paid for batches.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub cost_cents: i64,
    }

    /// `GET /api/events/{id}/analytics`.
    pub struct EventAnalyticsDto {
        /// Ticket price.
        pub ticket_price_cents: Option<i32>,
        /// Paid tickets.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub paid_tickets: i64,
        /// Declared sold: paid − unsold − lost.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub sold: i64,
        /// Voided as unsold.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub unsold: i64,
        /// Voided as lost.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub lost: i64,
        /// Voided for another reason.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub revoked: i64,
        /// Tickets that entered.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
        /// Copies stopped at the door.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub blocked_copies: i64,
        /// Sold × price, when the event has a price.
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub gross_cents: Option<i64>,
        /// Paid for the batches.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub cost_cents: i64,
        /// Gross minus cost.
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub net_cents: Option<i64>,
        /// Tickets that came free.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub free_tickets: i64,
        /// Active digital links.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub digital_tickets: i64,
        /// Of those, opened at least once.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub digital_opened: i64,
        /// First entry.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub first_entry_at: Option<OffsetDateTime>,
        /// Last entry.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub last_entry_at: Option<OffsetDateTime>,
        /// Entries per 15 minutes.
        pub timeline: Vec<EntryBucketDto>,
    }

    /// Entries in a 15-minute bar.
    pub struct EntryBucketDto {
        /// Start of the bar, with the event's offset.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub at: OffsetDateTime,
        /// First entries in it.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub entries: i64,
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
        /// Covers a refunded batch: permanent, cannot be undone (ADR 0032).
        pub locked: bool,
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
        /// Paid, then refunded by an admin: its numbers stay taken and voided.
        Refunded,
    }

    /// How a batch was paid.
    pub enum PaymentMethod {
        /// Online, through Stripe Checkout.
        Stripe,
        /// Marked as paid by an admin.
        Admin,
        /// Entirely covered by the organization's free tickets (or a 100% discount).
        Free,
        /// Covered by the organization's credit (ADR 0040).
        Credit,
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

    /// Kind of a changelog note.
    pub enum ChangelogKind {
        /// A new feature.
        New,
        /// Something that got better.
        Improvement,
        /// A bug fixed.
        Fix,
        /// A security change.
        Security,
    }

    /// A ticket as the door sees it now.
    pub enum TicketState {
        /// Can enter.
        Valid,
        /// Voided: blocked at the door.
        Voided,
        /// Already entered.
        Entered,
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
db_enum!(BatchStatus { AwaitingPayment => "awaiting_payment", Paid => "paid", Canceled => "canceled", Refunded => "refunded" });
db_enum!(ChangelogKind { New => "new", Improvement => "improvement", Fix => "fix", Security => "security" });
db_enum!(PaymentMethod { Stripe => "stripe", Admin => "admin", Free => "free", Credit => "credit" });
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

// Platform controls (ADRs 0037–0043) --------------------------------------------------------

dto! {
    /// Maintenance state (ADR 0037).
    pub struct MaintenanceDto {
        /// `off`, `read_only` (organizers only read) or `full` (only admins get in).
        pub mode: MaintenanceMode,
        /// Message from the team, shown to organizers.
        pub message: Option<String>,
        /// When the team expects to be back (informative).
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub ends_at: Option<OffsetDateTime>,
        /// When the current mode started.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub started_at: Option<OffsetDateTime>,
    }

    /// A promotion running now (ADR 0039).
    pub struct ActivePromotionDto {
        /// Name.
        pub name: String,
        /// Public sentence ("Semana do rock: 20% off").
        pub headline: Option<String>,
        /// Discount on every batch.
        pub discount_percent: i32,
        /// When it ends.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub ends_at: OffsetDateTime,
    }

    /// `GET /api/platform` (no login): what every screen needs to know about the service.
    pub struct PlatformStatusDto {
        /// Maintenance.
        pub maintenance: MaintenanceDto,
        /// Whether new accounts can be created.
        pub registrations_open: bool,
        /// The best promotion running now.
        pub promotion: Option<ActivePromotionDto>,
        /// When announced new prices start (the price table says which).
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub new_prices_at: Option<OffsetDateTime>,
    }

    /// `GET|PUT /api/admin/settings`.
    pub struct PlatformSettingsDto {
        /// Maintenance.
        pub maintenance: MaintenanceDto,
        /// Whether new accounts can be created.
        pub registrations_open: bool,
        /// Domains whose addresses cannot create an account (subdomains included).
        pub blocked_email_domains: Vec<String>,
        /// Last change.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub updated_at: OffsetDateTime,
        /// Admin who made it.
        pub updated_by: Option<String>,
    }

    /// `PUT /api/admin/settings`: every switch is sent, so a partial body never reopens anything.
    pub struct PlatformSettingsBody {
        /// Maintenance mode.
        pub maintenance_mode: MaintenanceMode,
        /// Message (up to 500 characters).
        pub maintenance_message: Option<String>,
        /// Expected end.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub maintenance_ends_at: Option<OffsetDateTime>,
        /// New accounts.
        pub registrations_open: bool,
        /// Blocked domains, one per entry (normalized by the server).
        pub blocked_email_domains: Vec<String>,
    }

    /// An announcement as an organizer sees it (ADR 0038).
    pub struct AnnouncementDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Title.
        pub title: String,
        /// Text (paragraphs separated by blank lines).
        pub body: String,
        /// Tone.
        pub level: AnnouncementLevel,
        /// Bell only, or also a dialog on opening the panel.
        pub display: AnnouncementDisplay,
        /// Button text.
        pub cta_label: Option<String>,
        /// Button target: a path of the site or an https URL.
        pub cta_url: Option<String>,
        /// When it started showing.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// The user opened the bell or the dialog.
        pub seen: bool,
        /// The user closed the dialog.
        pub dismissed: bool,
    }

    /// One notification of the signed-in user (ADR 0038). The panel writes the text from `kind`
    /// and `data`.
    pub struct NotificationDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// What happened.
        pub kind: NotificationKind,
        /// Details (event name, amount...).
        #[cfg_attr(feature = "ts", ts(type = "Record<string, unknown>"))]
        pub data: serde_json::Value,
        /// When the user read it.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub read_at: Option<OffsetDateTime>,
        /// When.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// `GET /api/inbox`: what the bell shows (announcements and notifications, newest first).
    pub struct InboxDto {
        /// Announcements running now.
        pub announcements: Vec<AnnouncementDto>,
        /// The latest notifications.
        pub notifications: Vec<NotificationDto>,
        /// Unseen announcements plus unread notifications.
        pub unread: i32,
    }

    /// `POST /api/inbox/read`: marks things as seen/read (empty lists: everything).
    pub struct InboxReadBody {
        /// Announcements seen.
        #[cfg_attr(feature = "ts", ts(type = "string[]"))]
        pub announcements: Vec<Uuid>,
        /// Notifications read.
        #[cfg_attr(feature = "ts", ts(type = "string[]"))]
        pub notifications: Vec<Uuid>,
    }

    /// Reads of an announcement.
    pub struct AnnouncementStatsDto {
        /// Accounts that can see it.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub audience: i64,
        /// Accounts that saw it.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub seen: i64,
        /// Accounts that closed its dialog.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub dismissed: i64,
    }

    /// An announcement in the admin panel.
    pub struct AdminAnnouncementDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Title.
        pub title: String,
        /// Text.
        pub body: String,
        /// Tone.
        pub level: AnnouncementLevel,
        /// Bell only or dialog.
        pub display: AnnouncementDisplay,
        /// Button text.
        pub cta_label: Option<String>,
        /// Button target.
        pub cta_url: Option<String>,
        /// Start.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// End (none: until archived).
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub ends_at: Option<OffsetDateTime>,
        /// Derived status.
        pub status: AnnouncementStatus,
        /// Publication time.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub published_at: Option<OffsetDateTime>,
        /// Reads.
        pub stats: AnnouncementStatsDto,
        /// Author.
        pub created_by: Option<String>,
        /// Creation time.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// `POST /api/admin/announcements` and `PUT /api/admin/announcements/{id}`.
    pub struct AnnouncementBody {
        /// Title (3–120 characters).
        pub title: String,
        /// Text (up to 4,000 characters).
        pub body: String,
        /// Tone.
        pub level: AnnouncementLevel,
        /// Bell only or dialog.
        pub display: AnnouncementDisplay,
        /// Button text (with `ctaUrl`).
        pub cta_label: Option<String>,
        /// Button target (with `ctaLabel`): `/path` or `https://...`.
        pub cta_url: Option<String>,
        /// Start (default: now).
        #[serde(default, with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub starts_at: Option<OffsetDateTime>,
        /// End.
        #[serde(default, with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub ends_at: Option<OffsetDateTime>,
        /// Publish now (otherwise a draft).
        pub publish: bool,
    }

    /// One version of the price table (ADR 0039).
    pub struct PriceTableDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Tiers.
        pub tiers: Vec<PriceTierDto>,
        /// Smallest charge, in centavos.
        pub minimum_cents: i32,
        /// Free tickets of every organization.
        pub free_tickets: i32,
        /// When it starts.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub effective_at: OffsetDateTime,
        /// Note of the admin.
        pub note: Option<String>,
        /// Author.
        pub created_by: Option<String>,
        /// Creation time.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// `GET /api/admin/prices`.
    pub struct AdminPricesDto {
        /// In force now.
        pub current: PriceTableDto,
        /// Announced, starting later.
        pub upcoming: Option<PriceTableDto>,
        /// Every version, newest first.
        pub history: Vec<PriceTableDto>,
    }

    /// `POST /api/admin/prices`: a new version of the price table.
    pub struct PriceTableBody {
        /// Tiers in increasing order; the last covers 5,000 tickets.
        pub tiers: Vec<PriceTierDto>,
        /// Smallest charge, in centavos.
        pub minimum_cents: i32,
        /// Free tickets of every organization.
        pub free_tickets: i32,
        /// Start (default: now).
        #[serde(default, with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub effective_at: Option<OffsetDateTime>,
        /// Note (up to 200 characters).
        pub note: Option<String>,
        /// Tell every organizer with an announcement.
        pub announce: bool,
        /// How the announcement shows.
        pub announcement_display: AnnouncementDisplay,
    }

    /// A promotion in the admin panel.
    pub struct PromotionDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Name.
        pub name: String,
        /// Public sentence.
        pub headline: Option<String>,
        /// Discount.
        pub discount_percent: i32,
        /// Start.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// End.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub ends_at: OffsetDateTime,
        /// Switched on.
        pub active: bool,
        /// Batches created with it.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub batches: i64,
        /// Discount given, in centavos.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub discount_cents: i64,
    }

    /// `POST /api/admin/promotions` and `PUT /api/admin/promotions/{id}`.
    pub struct PromotionBody {
        /// Name (up to 80 characters).
        pub name: String,
        /// Public sentence (up to 120 characters).
        pub headline: Option<String>,
        /// Discount, 1–100.
        pub discount_percent: i32,
        /// Start.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub starts_at: OffsetDateTime,
        /// End.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub ends_at: OffsetDateTime,
        /// Switched on.
        pub active: bool,
    }

    /// A promo code in the admin panel (ADR 0040).
    pub struct PromoCodeDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// The code (uppercase).
        pub code: String,
        /// What it gives.
        pub kind: PromoCodeKind,
        /// Credit, in centavos.
        pub credit_cents: Option<i32>,
        /// Free tickets.
        pub free_tickets: Option<i32>,
        /// Discount on the next batch.
        pub discount_percent: Option<i32>,
        /// Note of the admin.
        pub description: Option<String>,
        /// Uses allowed (none: unlimited).
        pub max_redemptions: Option<i32>,
        /// Uses so far.
        pub redemptions_count: i32,
        /// Only organizations created after the code.
        pub new_organizations_only: bool,
        /// Start.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub starts_at: Option<OffsetDateTime>,
        /// Expiry.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub expires_at: Option<OffsetDateTime>,
        /// Switched off.
        pub disabled: bool,
        /// Creation time.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// `POST /api/admin/promo-codes`.
    pub struct PromoCodeBody {
        /// Code (4–32 letters, digits, `-` or `_`); generated when empty.
        pub code: Option<String>,
        /// What it gives.
        pub kind: PromoCodeKind,
        /// Credit in centavos (kind `credit`).
        pub credit_cents: Option<i32>,
        /// Free tickets (kind `free_tickets`).
        pub free_tickets: Option<i32>,
        /// Discount (kind `discount`).
        pub discount_percent: Option<i32>,
        /// Note.
        pub description: Option<String>,
        /// Uses allowed.
        pub max_redemptions: Option<i32>,
        /// Only new organizations.
        pub new_organizations_only: bool,
        /// Start.
        #[serde(default, with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub starts_at: Option<OffsetDateTime>,
        /// Expiry.
        #[serde(default, with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub expires_at: Option<OffsetDateTime>,
    }

    /// `PUT /api/admin/promo-codes/{id}`: what can change after a code is out.
    pub struct PromoCodeUpdateBody {
        /// Note.
        pub description: Option<String>,
        /// Uses allowed.
        pub max_redemptions: Option<i32>,
        /// Expiry.
        #[serde(default, with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub expires_at: Option<OffsetDateTime>,
        /// Switched off.
        pub disabled: bool,
    }

    /// One use of a promo code.
    pub struct PromoRedemptionDto {
        /// Organization.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub organization_id: Uuid,
        /// Its name.
        pub organization_name: String,
        /// Who typed it.
        pub redeemed_by: Option<String>,
        /// When.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub redeemed_at: OffsetDateTime,
        /// For a discount: when a batch used it.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub applied_at: Option<OffsetDateTime>,
    }

    /// `POST /api/account/redeem`.
    pub struct RedeemBody {
        /// The code as typed.
        pub code: String,
    }

    /// What a redeemed code gave.
    pub struct RedeemResultDto {
        /// Kind.
        pub kind: PromoCodeKind,
        /// Credit added, in centavos.
        pub credit_cents: Option<i32>,
        /// Free tickets added.
        pub free_tickets: Option<i32>,
        /// Discount waiting for the next batch.
        pub discount_percent: Option<i32>,
    }

    /// One movement of an organization's credit.
    pub struct CreditEntryDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Amount (negative when spent), in centavos.
        pub amount_cents: i32,
        /// Why.
        pub reason: CreditReason,
        /// Code, note of the admin...
        pub note: Option<String>,
        /// When.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// A discount code waiting for the next batch.
    pub struct PendingDiscountDto {
        /// The code.
        pub code: String,
        /// Discount.
        pub discount_percent: i32,
    }

    /// `GET /api/account/credits`.
    pub struct CreditsDto {
        /// Balance, in centavos.
        pub balance_cents: i32,
        /// Movements, newest first.
        pub entries: Vec<CreditEntryDto>,
        /// Discount waiting for the next batch.
        pub pending_discount: Option<PendingDiscountDto>,
    }

    /// `POST /api/admin/organizations/{id}/credits`.
    pub struct CreditAdjustBody {
        /// Amount (negative to remove), in centavos.
        pub amount_cents: i32,
        /// Why (shown to the organizer).
        pub note: Option<String>,
    }

    /// `POST /api/events/{id}/batches/quote`: what a batch would cost now, step by step.
    pub struct BatchQuoteDto {
        /// Tickets.
        pub quantity: i32,
        /// Of which free.
        pub free_tickets: i32,
        /// Price of the table (after free tickets, with the minimum), in centavos.
        pub list_price_cents: i32,
        /// Promotion applied.
        pub promotion: Option<ActivePromotionDto>,
        /// Discount code applied.
        pub discount_code: Option<PendingDiscountDto>,
        /// Discount of the promotion or the code, in centavos.
        pub discount_cents: i32,
        /// Credit used, in centavos.
        pub credit_cents: i32,
        /// What remains to pay, in centavos.
        pub total_cents: i32,
        /// Credit before this batch.
        pub credit_balance_cents: i32,
    }

    /// One e-mail of the log (ADR 0041).
    pub struct MailLogDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub id: i64,
        /// What it was.
        pub kind: String,
        /// Recipient (kept 30 days).
        pub to: Option<String>,
        /// Subject.
        pub subject: Option<String>,
        /// Delivery status.
        pub status: MailStatus,
        /// Provider's id.
        pub provider_id: Option<String>,
        /// Provider's refusal.
        pub error: Option<String>,
        /// When.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// Last status change.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub updated_at: OffsetDateTime,
    }

    /// `GET /api/admin/emails`.
    pub struct MailLogPageDto {
        /// This page.
        pub items: Vec<MailLogDto>,
        /// Matching rows.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub total: i64,
        /// Page (from 1).
        pub page: i32,
        /// Rows per page.
        pub per_page: i32,
    }

    /// A count by key.
    pub struct CountDto {
        /// Status or kind.
        pub key: String,
        /// Last 24 hours.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub day: i64,
        /// Last 7 days.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub week: i64,
    }

    /// E-mails of one day.
    pub struct MailDayDto {
        /// `2026-10-09` (UTC).
        pub date: String,
        /// Handed to the provider.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub sent: i64,
        /// Refused or failed.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub failed: i64,
    }

    /// `GET /api/admin/emails/summary`.
    pub struct MailSummaryDto {
        /// `resend`, `log` (development) or `memory` (tests).
        pub provider: String,
        /// Sender.
        pub from: Option<String>,
        /// Delivery webhook configured (delivered/bounced statuses).
        pub webhook: bool,
        /// Daily quota (none: unlimited).
        #[cfg_attr(feature = "ts", ts(type = "number | null"))]
        pub daily_limit: Option<i64>,
        /// Counted against it in the last 24 hours.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub used_today: i64,
        /// Of which codes for new addresses.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub signups_today: i64,
        /// Counts by status.
        pub by_status: Vec<CountDto>,
        /// Counts by kind.
        pub by_kind: Vec<CountDto>,
        /// The last 14 days.
        pub days: Vec<MailDayDto>,
    }

    /// A flagged image (ADR 0042).
    pub struct ModerationFlagDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// The art.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub art_id: Uuid,
        /// Organization.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub organization_id: Uuid,
        /// Its name.
        pub organization_name: String,
        /// Event.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub event_id: Uuid,
        /// Its name.
        pub event_name: String,
        /// Uploader.
        pub uploaded_by: Option<String>,
        /// `adult`, `violence`, `racy`, `manual`...
        pub reasons: Vec<String>,
        /// Classifier likelihoods (0–5).
        #[cfg_attr(feature = "ts", ts(type = "Record<string, unknown>"))]
        pub details: serde_json::Value,
        /// 0–1.
        pub score: f32,
        /// Automatic or by an admin.
        pub source: String,
        /// Review status.
        pub status: ModerationStatus,
        /// Note of the reviewer.
        pub resolution_note: Option<String>,
        /// Reviewer.
        pub resolved_by: Option<String>,
        /// Review time.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub resolved_at: Option<OffsetDateTime>,
        /// Flag time.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
        /// Width.
        pub width_px: i32,
        /// Height.
        pub height_px: i32,
    }

    /// A recent upload, for manual review.
    pub struct RecentArtDto {
        /// The art.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub art_id: Uuid,
        /// Organization.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub organization_id: Uuid,
        /// Its name.
        pub organization_name: String,
        /// Event.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub event_id: Uuid,
        /// Its name.
        pub event_name: String,
        /// Moderation of the image.
        pub moderation: String,
        /// Upload time.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// `GET /api/admin/moderation/summary`.
    pub struct ModerationSummaryDto {
        /// Flags waiting for a decision.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub open: i64,
        /// Classifier configured.
        pub classifier: bool,
        /// Classifications today.
        pub used_today: i32,
        /// Allowed per day.
        pub daily_limit: i32,
    }

    /// `POST /api/admin/moderation/{id}/resolve`.
    pub struct ModerationResolveBody {
        /// `approve` or `reject`.
        pub action: ModerationAction,
        /// Note (shown to the organizer when rejecting).
        pub note: Option<String>,
        /// Notify the organization.
        pub notify: bool,
        /// Also suspend the organization.
        pub suspend: bool,
    }

    /// `POST /api/admin/moderation/arts/{id}/flag`.
    pub struct ModerationFlagBody {
        /// Why.
        pub note: Option<String>,
    }

    /// One service on the status page (ADR 0043).
    pub struct StatusComponentDto {
        /// `api`, `database`, `files`, `email`, `payments`.
        pub key: String,
        /// State.
        pub status: ServiceStatus,
    }

    /// One update of an incident.
    pub struct IncidentUpdateDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Status after it.
        pub status: IncidentStatus,
        /// Text.
        pub body: String,
        /// When.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub created_at: OffsetDateTime,
    }

    /// An incident or planned maintenance.
    pub struct IncidentDto {
        /// Id.
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub id: Uuid,
        /// Incident or maintenance.
        pub kind: IncidentKind,
        /// Title.
        pub title: String,
        /// Impact.
        pub impact: IncidentImpact,
        /// Status.
        pub status: IncidentStatus,
        /// Parts of the service affected.
        pub components: Vec<String>,
        /// Planned start (maintenance).
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub scheduled_for: Option<OffsetDateTime>,
        /// Planned end (maintenance).
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub scheduled_until: Option<OffsetDateTime>,
        /// Start.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub started_at: OffsetDateTime,
        /// End.
        #[serde(with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub resolved_at: Option<OffsetDateTime>,
        /// Timeline, newest first.
        pub updates: Vec<IncidentUpdateDto>,
    }

    /// `GET /api/status` (no login).
    pub struct StatusDto {
        /// Overall state.
        pub status: ServiceStatus,
        /// When the server checked.
        #[serde(with = "time::serde::rfc3339")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        pub checked_at: OffsetDateTime,
        /// Services.
        pub components: Vec<StatusComponentDto>,
        /// Maintenance mode.
        pub maintenance: MaintenanceDto,
        /// Open incidents and planned maintenance.
        pub active: Vec<IncidentDto>,
        /// Resolved in the last 90 days.
        pub recent: Vec<IncidentDto>,
    }

    /// `POST /api/admin/incidents` and `PUT /api/admin/incidents/{id}`.
    pub struct IncidentBody {
        /// Incident or maintenance.
        pub kind: IncidentKind,
        /// Title.
        pub title: String,
        /// Impact.
        pub impact: IncidentImpact,
        /// Parts affected.
        pub components: Vec<String>,
        /// Planned start.
        #[serde(default, with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub scheduled_for: Option<OffsetDateTime>,
        /// Planned end.
        #[serde(default, with = "time::serde::rfc3339::option")]
        #[cfg_attr(feature = "ts", ts(type = "string | null"))]
        pub scheduled_until: Option<OffsetDateTime>,
        /// First update (create only).
        pub message: Option<String>,
        /// Status (create only).
        pub status: Option<IncidentStatus>,
    }

    /// `POST /api/admin/incidents/{id}/updates`.
    pub struct IncidentUpdateBody {
        /// New status.
        pub status: IncidentStatus,
        /// Text.
        pub body: String,
    }

    /// `GET /api/admin/audit`.
    pub struct AuditPageDto {
        /// This page.
        pub items: Vec<AuditEntryDto>,
        /// Matching rows.
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        pub total: i64,
        /// Page (from 1).
        pub page: i32,
        /// Rows per page.
        pub per_page: i32,
    }
}

dto_enum! {
    /// Maintenance mode (ADR 0037).
    pub enum MaintenanceMode {
        /// Normal.
        Off,
        /// Organizers read but cannot change anything.
        ReadOnly,
        /// Only admins get in.
        Full,
    }

    /// Tone of an announcement.
    pub enum AnnouncementLevel {
        /// Neutral.
        Info,
        /// Good news.
        Success,
        /// Attention.
        Warning,
        /// Urgent.
        Critical,
    }

    /// Where an announcement shows.
    pub enum AnnouncementDisplay {
        /// The bell only.
        Notification,
        /// Also a dialog when the panel opens.
        Modal,
    }

    /// Derived status of an announcement.
    pub enum AnnouncementStatus {
        /// Not published.
        Draft,
        /// Published, starts later.
        Scheduled,
        /// Showing.
        Active,
        /// Past its end.
        Ended,
        /// Taken down.
        Archived,
    }

    /// What a notification is about.
    pub enum NotificationKind {
        /// An image of the user was refused by an admin.
        ArtRejected,
        /// An image under review was approved.
        ArtApproved,
        /// Credit added to the organization.
        CreditsGranted,
        /// Free tickets added.
        FreeTicketsGranted,
        /// A discount waits for the next batch.
        DiscountGranted,
        /// Prices will change.
        PriceChange,
    }

    /// What a promo code gives.
    pub enum PromoCodeKind {
        /// Credit in reais.
        Credit,
        /// Free tickets.
        FreeTickets,
        /// A discount on the next batch.
        Discount,
    }

    /// Why credit moved.
    pub enum CreditReason {
        /// A promo code.
        PromoCode,
        /// An admin.
        AdminAdjustment,
        /// Spent on a batch.
        BatchPayment,
        /// Back from a canceled batch.
        BatchCancel,
        /// Back from a refunded batch.
        BatchRefund,
    }

    /// Delivery status of an e-mail.
    pub enum MailStatus {
        /// Being handed to the provider.
        Sending,
        /// Accepted by the provider.
        Sent,
        /// The provider refused or could not be reached.
        Failed,
        /// Not sent: daily quota.
        Quota,
        /// Delivered to the mailbox (webhook).
        Delivered,
        /// Delivery delayed (webhook).
        DeliveryDelayed,
        /// Bounced (webhook).
        Bounced,
        /// Marked as spam (webhook).
        Complained,
    }

    /// Review of a flagged image.
    pub enum ModerationStatus {
        /// Waiting for an admin.
        Open,
        /// Allowed.
        Approved,
        /// Refused: the image cannot be printed.
        Rejected,
    }

    /// Decision on a flagged image.
    pub enum ModerationAction {
        /// Allow.
        Approve,
        /// Refuse.
        Reject,
    }

    /// State of a service.
    pub enum ServiceStatus {
        /// Working.
        Operational,
        /// Slow or partly failing.
        Degraded,
        /// Not working.
        Down,
        /// Under maintenance.
        Maintenance,
    }

    /// Incident or planned maintenance.
    pub enum IncidentKind {
        /// Something broke.
        Incident,
        /// Planned work.
        Maintenance,
    }

    /// How bad.
    pub enum IncidentImpact {
        /// No visible impact.
        None,
        /// Some people notice.
        Minor,
        /// Many people affected.
        Major,
        /// The service is down.
        Critical,
    }

    /// Progress of an incident.
    pub enum IncidentStatus {
        /// Planned.
        Scheduled,
        /// Looking into it.
        Investigating,
        /// Cause found.
        Identified,
        /// Fixed, watching.
        Monitoring,
        /// Over.
        Resolved,
    }
}

db_enum!(MaintenanceMode { Off => "off", ReadOnly => "read_only", Full => "full" });
db_enum!(AnnouncementLevel { Info => "info", Success => "success", Warning => "warning", Critical => "critical" });
db_enum!(AnnouncementDisplay { Notification => "notification", Modal => "modal" });
db_enum!(NotificationKind {
    ArtRejected => "art_rejected",
    ArtApproved => "art_approved",
    CreditsGranted => "credits_granted",
    FreeTicketsGranted => "free_tickets_granted",
    DiscountGranted => "discount_granted",
    PriceChange => "price_change",
});
db_enum!(PromoCodeKind { Credit => "credit", FreeTickets => "free_tickets", Discount => "discount" });
db_enum!(CreditReason {
    PromoCode => "promo_code",
    AdminAdjustment => "admin_adjustment",
    BatchPayment => "batch_payment",
    BatchCancel => "batch_cancel",
    BatchRefund => "batch_refund",
});
db_enum!(MailStatus {
    Sending => "sending",
    Sent => "sent",
    Failed => "failed",
    Quota => "quota",
    Delivered => "delivered",
    DeliveryDelayed => "delivery_delayed",
    Bounced => "bounced",
    Complained => "complained",
});
db_enum!(ModerationStatus { Open => "open", Approved => "approved", Rejected => "rejected" });
db_enum!(IncidentKind { Incident => "incident", Maintenance => "maintenance" });
db_enum!(IncidentImpact { None => "none", Minor => "minor", Major => "major", Critical => "critical" });
db_enum!(IncidentStatus {
    Scheduled => "scheduled",
    Investigating => "investigating",
    Identified => "identified",
    Monitoring => "monitoring",
    Resolved => "resolved",
});
