/* Ícones de linha simples (stroke=currentColor), 22x22, sem dependências externas. */
const ICONS = {
  people: `<path d="M7 10a3 3 0 100-6 3 3 0 000 6zM15 11a2.6 2.6 0 100-5.2 2.6 2.6 0 000 5.2z"/><path d="M2 18c.5-3 2.4-4.6 5-4.6s4.5 1.6 5 4.6M12.5 13.6c2.3.2 3.9 1.7 4.5 4.4"/>`,
  clipboard: `<rect x="5" y="4" width="12" height="15" rx="2"/><path d="M8 4V3a1 1 0 011-1h2a1 1 0 011 1v1M8 10h6M8 14h6"/>`,
  pencil: `<path d="M4 15.5V18h2.5L15 9.5 12.5 7 4 15.5z"/><path d="M13.7 6l1.8-1.8a1.2 1.2 0 011.7 0l1.1 1.1a1.2 1.2 0 010 1.7L16.5 8.8"/>`,
  refresh: `<path d="M4 10a6 6 0 0110-4.2M16 10a6 6 0 01-10 4.2"/><path d="M14 3v3h-3M6 17v-3h3"/>`,
  coins: `<ellipse cx="8" cy="6" rx="5" ry="2.6"/><path d="M3 6v9c0 1.4 2.2 2.6 5 2.6s5-1.2 5-2.6V6"/><path d="M8 11.3c2.8 0 5-1.2 5-2.6"/><ellipse cx="15" cy="13" rx="4" ry="2"/>`,
  palm: `<path d="M10 20V10M10 10c-1-3-4-3.5-6-2 1.5 1.6 3.6 1.8 6 .3M10 10c1-3 4-3.5 6-2-1.5 1.6-3.6 1.8-6 .3M10 9c-.5-2.4-2.6-3.5-4.6-3 1 2 2.8 3 4.6 2.6M10 9c.5-2.4 2.6-3.5 4.6-3-1 2-2.8 3-4.6 2.6"/>`,
  clock: `<circle cx="10" cy="10" r="7.5"/><path d="M10 6v4l3 2"/>`,
  laptop: `<rect x="4" y="4" width="12" height="8" rx="1"/><path d="M2 16h16M8 12v1.5M12 12v1.5"/>`,
  bandage: `<rect x="3.5" y="7.5" width="13" height="5" rx="2.2" transform="rotate(-35 10 10)"/><circle cx="7.3" cy="9" r="0.6" transform="rotate(-35 10 10)"/><circle cx="12.7" cy="11" r="0.6" transform="rotate(-35 10 10)"/>`,
  trend: `<path d="M3 15l5-5 3 3 6-7"/><path d="M13 5h4v4"/>`,
  kanban: `<rect x="3" y="4" width="4" height="12" rx="1"/><rect x="8.5" y="4" width="4" height="8" rx="1"/><rect x="14" y="4" width="4" height="15" rx="1"/>`,
  pin: `<path d="M10 2c2.5 0 4.5 2 4.5 4.5 0 3.3-4.5 8-4.5 8s-4.5-4.7-4.5-8C5.5 4 7.5 2 10 2z"/><circle cx="10" cy="6.6" r="1.6"/>`,
  userplus: `<circle cx="8" cy="7" r="3.2"/><path d="M2.5 17c.4-3 2.6-4.7 5.5-4.7s5.1 1.7 5.5 4.7"/><path d="M15.5 5.5v4.5M13.3 7.8h4.4"/>`,
  users: `<circle cx="7" cy="8" r="3"/><circle cx="14" cy="9" r="2.4"/><path d="M2 17c.4-3.2 2.4-5 5-5s4.6 1.8 5 5M13.5 12.5c2.1.3 3.5 1.8 4 4.5"/>`,
  invoice: `<path d="M5 2.5h8l2.5 2.5V17a.7.7 0 01-.7.7H5.7A.7.7 0 015 17V2.5z"/><path d="M13 2.5V5h2.5"/><path d="M7 9h6M7 12h6M7 6h3"/>`,
  bars: `<rect x="3" y="10" width="3" height="7"/><rect x="8.5" y="6" width="3" height="11"/><rect x="14" y="2.5" width="3" height="14.5"/>`,
  gauge: `<path d="M3 14a7 7 0 1114 0"/><path d="M10 14l3.5-4.2"/><circle cx="10" cy="14" r="1"/>`,
  alert: `<path d="M10 2.5l8.2 14.2a1 1 0 01-.9 1.5H2.7a1 1 0 01-.9-1.5L10 2.5z"/><path d="M10 8v4.2"/><circle cx="10" cy="14.6" r=".9"/>`,
  usercheck: `<circle cx="7.5" cy="7.5" r="3.2"/><path d="M2 17c.4-3 2.4-4.7 5.5-4.7 1.2 0 2.2.2 3.1.7"/><path d="M13.5 12.5l1.6 1.6 3-3.2"/>`,
  catalog: `<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M3 8h14M8 8v9"/>`,
  calendar: `<rect x="3" y="4" width="14" height="13" rx="2"/><path d="M3 8.5h14M7 2.5v3M13 2.5v3"/><circle cx="7.3" cy="12" r=".8"/><circle cx="10.3" cy="12" r=".8"/><circle cx="13.3" cy="12" r=".8"/>`,
  home: `<path d="M3 9.5L10 3l7 6.5"/><path d="M5 8.5V17h10V8.5"/><path d="M8 17v-4.5h4V17"/>`,
  shield: `<path d="M10 2.5l6 2.3v4.6c0 3.8-2.6 6.6-6 8.1-3.4-1.5-6-4.3-6-8.1V4.8l6-2.3z"/><path d="M7.5 10l1.8 1.8L13 8"/>`,
  history: `<path d="M3.5 10a6.5 6.5 0 106.5-6.5c-2.2 0-4.1 1.1-5.3 2.7"/><path d="M4.5 2.8v3.5H8"/><path d="M10 6.5V10l2.5 1.6"/>`,
  gear: `<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>`,
  link: `<path d="M8.5 11.5a3 3 0 004.2 0l2.6-2.6a3 3 0 00-4.2-4.2l-1 1"/><path d="M11.5 8.5a3 3 0 00-4.2 0l-2.6 2.6a3 3 0 004.2 4.2l1-1"/>`,
  download: `<path d="M10 3v9.5M6 9l4 4 4-4"/><path d="M3.5 14.5v2h13v-2"/>`,
  eye: `<path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z"/><circle cx="10" cy="10" r="2.4"/>`,
  mail: `<rect x="2.5" y="4.5" width="15" height="11" rx="2"/><path d="M3 5.5l7 5.5 7-5.5"/>`,
};

function iconSVG(name, extraClass){
  const body = ICONS[name] || ICONS.pin;
  return `<svg class="${extraClass||''}" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
