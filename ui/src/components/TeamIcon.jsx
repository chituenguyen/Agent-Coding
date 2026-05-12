// Custom 2-tone SVG icons for engineer-room team roles. Picked by agent slug.
// `color` is the team's accent colour. Stroke uses `currentColor` so the
// parent can tint via text-color too.

const COMMON = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function Frontend({ color }) {
  return (
    <svg {...COMMON} stroke={color} strokeWidth="1.5">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M3 8h18" opacity="0.6" />
      <circle cx="5.5" cy="6" r="0.5" fill={color} stroke="none" />
      <circle cx="7.5" cy="6" r="0.5" fill={color} stroke="none" />
      <rect x="6" y="11" width="5" height="4" rx="0.5" fill={color} fillOpacity="0.25" stroke="none" />
      <path d="M13 11h5M13 14h3" opacity="0.7" />
      <path d="M8 21h8M12 18v3" opacity="0.5" />
    </svg>
  );
}

function Backend({ color }) {
  return (
    <svg {...COMMON} stroke={color} strokeWidth="1.5">
      <ellipse cx="12" cy="5" rx="7" ry="2.2" />
      <path d="M5 5v6c0 1.2 3.1 2.2 7 2.2s7-1 7-2.2V5" />
      <path d="M5 11v6c0 1.2 3.1 2.2 7 2.2s7-1 7-2.2v-6" />
      <circle cx="8" cy="11" r="0.5" fill={color} stroke="none" />
      <circle cx="8" cy="17" r="0.5" fill={color} stroke="none" />
    </svg>
  );
}

function DevOps({ color }) {
  // Three stacked rotating containers — feels k8s/cluster
  return (
    <svg {...COMMON} stroke={color} strokeWidth="1.5">
      <path d="M12 3l7 4v10l-7 4-7-4V7l7-4z" />
      <path d="M12 3v8" opacity="0.6" />
      <path d="M5 7l7 4 7-4" opacity="0.6" />
      <path d="M12 21v-10" opacity="0" />
      <circle cx="12" cy="11" r="1.4" fill={color} fillOpacity="0.25" stroke="none" />
    </svg>
  );
}

function Architect({ color }) {
  // Connected nodes — graph / system blueprint
  return (
    <svg {...COMMON} stroke={color} strokeWidth="1.5">
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <circle cx="12" cy="11" r="1.3" fill={color} fillOpacity="0.25" />
      <path d="M7.4 7.4l3.4 2.3M16.6 7.4l-3.4 2.3M12 12.3v3.7" opacity="0.6" />
    </svg>
  );
}

function Fallback({ color, label }) {
  return (
    <svg {...COMMON} stroke={color} strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" fill={color} fillOpacity="0.15" stroke="none" />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fill={color}
        stroke="none"
      >
        {(label || "?").slice(0, 1).toUpperCase()}
      </text>
    </svg>
  );
}

export default function TeamIcon({ agent, color = "#888", name }) {
  switch (agent) {
    case "coder-frontend":
      return <Frontend color={color} />;
    case "coder-backend":
      return <Backend color={color} />;
    case "devops":
      return <DevOps color={color} />;
    case "architect":
      return <Architect color={color} />;
    default:
      return <Fallback color={color} label={name} />;
  }
}
