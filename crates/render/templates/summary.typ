// The event's final summary (ADR 0101): one page to send the committee or the board, as a PDF or
// a picture. Every value comes from /data.json, already formatted; user text is only displayed.
#let data = json("/data.json")
#let ink = rgb("#0e0d14")
#let muted = rgb("#5b5a6b")
#let rule = rgb("#e4e4ea")
#let soft = rgb("#f4f3f8")
#let accent = rgb(data.color)
#let tones = (good: rgb("#15803d"), bad: rgb("#b91c1c"))

// 4:5, the shape a phone shows best in a chat; it prints well on half an A4 too.
#set page(width: 180mm, height: 225mm, margin: 0mm)
#set text(font: "Lato", size: 9.5pt, fill: ink, lang: "pt")
#set par(leading: 0.5em)

#block(width: 100%, fill: accent, inset: (x: 14mm, top: 13mm, bottom: 11mm), {
  set text(fill: white)
  text(size: 8pt, weight: "bold", tracking: 0.12em, upper(data.kicker))
  v(2.5mm)
  text(size: if data.title.len() > 40 { 20pt } else { 25pt }, weight: "bold", data.title)
  v(2mm)
  text(size: 9.5pt, fill: white.transparentize(15%), data.subtitle)
})

#block(width: 100%, inset: (x: 14mm, top: 8mm, bottom: 0mm), {
  let figure(f, big) = {
    let color = if f.tone == none { ink } else { tones.at(f.tone) }
    block(width: 100%, inset: (x: 4mm, y: if big { 4mm } else { 3mm }), radius: 2.5mm,
      fill: if big { soft } else { none }, stroke: if big { none } else { 0.5pt + rule },
      stack(spacing: 1.8mm,
        text(size: 8pt, fill: muted, f.label),
        text(size: if big { 19pt } else { 12pt }, weight: "bold", fill: color, f.value),
        if f.note != none { text(size: 7.5pt, fill: muted, f.note) }))
  }
  grid(columns: (1fr, 1fr), column-gutter: 3mm, row-gutter: 3mm,
    ..data.headline.map(f => figure(f, true)))
  if data.details.len() > 0 {
    v(3mm)
    grid(columns: (1fr,) * calc.min(data.details.len(), 4), column-gutter: 3mm,
      ..data.details.map(f => figure(f, false)))
  }
  if data.highlights.len() > 0 {
    v(7mm)
    text(size: 11pt, weight: "bold", data.highlightsTitle)
    v(3mm)
    for h in data.highlights {
      block(width: 100%, below: 2mm, inset: (x: 3.5mm, y: 2.6mm), radius: 2mm, stroke: 0.5pt + rule,
        grid(columns: (8mm, 1fr, auto), align: (left + horizon, left + horizon, right + horizon),
          box(width: 6.5mm, height: 6.5mm, radius: 3.25mm,
            fill: if h.position == 1 { accent } else { soft },
            align(center + horizon, text(size: 8.5pt, weight: "bold",
              fill: if h.position == 1 { white } else { ink }, str(h.position)))),
          text(size: 10pt, weight: "bold", h.name),
          stack(dir: ttb, spacing: 1mm,
            align(right, text(size: 9.5pt, weight: "bold", h.value)),
            if h.amount != none { align(right, text(size: 7.5pt, fill: muted, h.amount)) })))
    }
  }
})

#place(bottom + left, dx: 14mm, dy: -9mm, block(width: 152mm, {
  line(length: 100%, stroke: 0.5pt + rule)
  v(2.5mm)
  grid(columns: (1fr, auto),
    text(size: 7.5pt, fill: muted, data.footer),
    text(size: 7.5pt, weight: "bold", fill: accent, data.brand))
}))
