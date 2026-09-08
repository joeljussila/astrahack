// A native canvas takes precedence over a forgotten browser editor. Within one
// class of editor, the most recently focused/claimed authenticated host wins.
export function canvasHost(clients) {
  return [...clients].filter(([ws,role])=>role==='host'&&ws.readyState===1)
    .sort(([a],[b])=>(b.canvasPriority||0)-(a.canvasPriority||0)||(b.canvasClaim||0)-(a.canvasClaim||0))[0]?.[0];
}
