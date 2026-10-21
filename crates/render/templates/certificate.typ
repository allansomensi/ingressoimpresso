// Certificate of participation (ADR 0113): one A4 landscape page per person. Every value comes
// from /data.json, already resolved; the name inside the text arrives as its own segment to be set
// in bold. User text is only displayed (CLAUDE.md invariant 5).
#let data = json("/data.json")
#let ink = rgb("#1b1a24")
#let muted = rgb("#5b5a6b")
#let accent = rgb(data.color)

#set page(paper: "a4", flipped: true, margin: 0mm)
#set text(font: "Lato", size: 13pt, fill: ink, lang: "pt")
#set par(leading: 0.75em, justify: false)

// The frame: a band of the accent and a thin line inside it.
#place(top + left, rect(width: 100%, height: 100%, stroke: (paint: accent, thickness: 9mm)))
#place(top + left, dx: 12mm, dy: 12mm,
  rect(width: 297mm - 24mm, height: 210mm - 24mm, stroke: (paint: accent.lighten(40%), thickness: 0.8pt)))

#block(width: 100%, height: 100%, inset: (x: 30mm, top: 26mm, bottom: 22mm), {
  align(center, {
    text(size: 10pt, weight: "bold", tracking: 0.3em, fill: accent, upper(data.kicker))
    v(4mm)
    text(font: "Abril Fatface", size: if data.title.len() > 34 { 26pt } else { 34pt }, data.title)
    v(12mm)
    block(width: 88%, {
      set par(justify: false, leading: 0.9em)
      for segment in data.body {
        if segment.strong {
          text(size: 17pt, weight: "bold", segment.text)
        } else {
          text(size: 14pt, segment.text)
        }
      }
    })
    if data.workload != none {
      v(6mm)
      text(size: 12pt, fill: muted, data.workloadLabel + " " + data.workload)
    }
    v(4mm)
    text(size: 11pt, fill: muted, data.place)
  })

  // Signatures and the check, at the bottom.
  place(bottom + left, block(width: 100%, {
    grid(columns: (1fr, 1fr, auto), column-gutter: 10mm, align: (center + bottom, center + bottom, right + bottom),
      ..data.signers.map(s => block(width: 100%, {
        line(length: 70%, stroke: 0.6pt + ink)
        v(1.5mm)
        text(size: 11pt, weight: "bold", s.name)
        linebreak()
        // An empty line keeps the names of both signers at the same height.
        text(size: 9.5pt, fill: muted, if s.role != none { s.role } else { " " })
      })),
      ..range(2 - data.signers.len()).map(_ => []),
      block({
        align(right, {
          image(data.qr, width: 24mm)
          text(size: 7.5pt, fill: muted, data.code)
          linebreak()
          text(size: 7pt, fill: muted, data.check)
        })
      }))
  }))
})
