//! Event details printed by text blocks through fields such as `{evento}` or `{data}`.
//!
//! The painel's live preview mirrors these rules (`apps/web/src/lib/ticket-fields.ts`); both
//! are tested against the same examples.

use time::PrimitiveDateTime;

use crate::texts::{FREE_PRICE, MONTHS, WEEKDAYS};

/// Every field a text block may use, without braces.
pub const FIELDS: &[&str] = &[
    "evento",
    "local",
    "data",
    "data_extenso",
    "semana",
    "dia",
    "mes",
    "mes_curto",
    "ano",
    "hora",
    "preco",
];

/// What text blocks can print about the event, besides its name.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct EventDetails {
    /// Venue.
    pub venue: Option<String>,
    /// Start, in the wall-clock time of the event's place.
    pub starts_at: Option<PrimitiveDateTime>,
    /// Ticket price in cents.
    pub price_cents: Option<i64>,
}

/// `text` with its fields replaced. `None` when a field it uses has no value (an event without
/// venue or price), so a half-filled line such as "Local: " is never printed. Unknown names in
/// braces are printed as typed.
pub fn resolve(text: &str, event_name: &str, details: &EventDetails) -> Option<String> {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(open) = rest.find('{') {
        let (before, from_brace) = rest.split_at(open);
        out.push_str(before);
        let field = from_brace
            .get(1..)
            .and_then(|after| after.find('}').map(|close| (after, close)))
            .and_then(|(after, close)| {
                let name = after.get(..close)?;
                FIELDS.contains(&name).then_some((name, close))
            });
        if let Some((name, close)) = field {
            let value = value(name, event_name, details)?;
            if value.is_empty() {
                return None;
            }
            out.push_str(&value);
            // `{` + name + `}`.
            rest = from_brace.get(close + 2..).unwrap_or_default();
        } else {
            out.push('{');
            rest = from_brace.get(1..).unwrap_or_default();
        }
    }
    out.push_str(rest);
    Some(out)
}

fn value(name: &str, event_name: &str, details: &EventDetails) -> Option<String> {
    let date = || details.starts_at;
    let month = |date: PrimitiveDateTime| MONTHS.get(usize::from(u8::from(date.month()) - 1));
    let weekday = |date: PrimitiveDateTime| {
        WEEKDAYS.get(usize::from(date.weekday().number_days_from_monday()))
    };
    Some(match name {
        "evento" => event_name.trim().to_owned(),
        "local" => details
            .venue
            .as_deref()
            .unwrap_or_default()
            .trim()
            .to_owned(),
        "data" => date().map_or_else(String::new, |d| {
            format!("{:02}/{:02}/{}", d.day(), u8::from(d.month()), d.year())
        }),
        "data_extenso" => match date() {
            Some(d) => format!(
                "{}, {} de {} de {}",
                weekday(d)?,
                d.day(),
                month(d)?,
                d.year()
            ),
            None => String::new(),
        },
        "semana" => match date() {
            Some(d) => (*weekday(d)?).to_owned(),
            None => String::new(),
        },
        "dia" => date().map_or_else(String::new, |d| format!("{:02}", d.day())),
        "mes" => match date() {
            Some(d) => (*month(d)?).to_owned(),
            None => String::new(),
        },
        "mes_curto" => match date() {
            Some(d) => month(d)?.chars().take(3).collect(),
            None => String::new(),
        },
        "ano" => date().map_or_else(String::new, |d| d.year().to_string()),
        "hora" => date().map_or_else(String::new, |d| match d.minute() {
            0 => format!("{}h", d.hour()),
            minute => format!("{}h{minute:02}", d.hour()),
        }),
        "preco" => details.price_cents.map_or_else(String::new, money),
        _ => return None,
    })
}

/// `R$ 1.234,50`; zero is [`FREE_PRICE`].
fn money(cents: i64) -> String {
    if cents == 0 {
        return FREE_PRICE.to_owned();
    }
    let reais = (cents / 100).unsigned_abs().to_string();
    let mut grouped = String::new();
    for (index, digit) in reais.chars().enumerate() {
        if index > 0 && (reais.len() - index).is_multiple_of(3) {
            grouped.push('.');
        }
        grouped.push(digit);
    }
    let sign = if cents < 0 { "-" } else { "" };
    format!("{sign}R$ {grouped},{:02}", (cents % 100).unsigned_abs())
}

#[cfg(test)]
mod tests {
    use time::macros::datetime;

    use super::*;

    fn details() -> EventDetails {
        EventDetails {
            venue: Some("Ginásio Municipal".to_owned()),
            starts_at: Some(datetime!(2026-03-14 21:00)),
            price_cents: Some(2_500),
        }
    }

    #[test]
    fn replaces_every_field() {
        let cases = [
            ("{evento}", "Arraiá da Escola"),
            ("{local}", "Ginásio Municipal"),
            ("{data}", "14/03/2026"),
            ("{data_extenso}", "sábado, 14 de março de 2026"),
            ("{semana}", "sábado"),
            ("{dia}", "14"),
            ("{mes}", "março"),
            ("{mes_curto}", "mar"),
            ("{ano}", "2026"),
            ("{hora}", "21h"),
            ("{preco}", "R$ 25,00"),
            ("{dia}/{mes_curto} · {hora}", "14/mar · 21h"),
        ];
        for (text, expected) in cases {
            assert_eq!(
                resolve(text, " Arraiá da Escola ", &details()).as_deref(),
                Some(expected),
                "{text}"
            );
        }
    }

    #[test]
    fn formats_minutes_days_and_prices() {
        let details = EventDetails {
            venue: None,
            starts_at: Some(datetime!(2026-01-05 09:30)),
            price_cents: Some(123_456_789),
        };
        assert_eq!(resolve("{hora}", "", &details).as_deref(), Some("9h30"));
        assert_eq!(resolve("{dia}", "", &details).as_deref(), Some("05"));
        assert_eq!(
            resolve("{data_extenso}", "", &details).as_deref(),
            Some("segunda-feira, 5 de janeiro de 2026")
        );
        assert_eq!(
            resolve("{preco}", "", &details).as_deref(),
            Some("R$ 1.234.567,89")
        );
        let free = EventDetails {
            price_cents: Some(0),
            ..details
        };
        assert_eq!(resolve("{preco}", "", &free).as_deref(), Some("Gratuito"));
    }

    #[test]
    fn hides_texts_with_empty_fields() {
        let empty = EventDetails::default();
        assert_eq!(resolve("Local: {local}", "Show", &empty), None);
        assert_eq!(resolve("{preco}", "Show", &empty), None);
        assert_eq!(resolve("{data} {hora}", "Show", &empty), None);
        assert_eq!(
            resolve("Entrada individual", "Show", &empty).as_deref(),
            Some("Entrada individual")
        );
    }

    #[test]
    fn keeps_unknown_or_broken_braces() {
        let text = "{nome} {evento} { {evento";
        assert_eq!(
            resolve(text, "Show", &details()).as_deref(),
            Some("{nome} Show { {evento")
        );
        assert_eq!(resolve("}{", "Show", &details()).as_deref(), Some("}{"));
    }
}
