// Faint background symbol that varies per page function.
const MOTIFS = {
  "/": ( // Dashboard — trend line
    <>
      <path d="M32 44 L32 162 L198 162" strokeWidth="4" />
      <path d="M40 148 L78 112 L114 130 L152 80 L192 102" />
    </>
  ),
  "/leads": ( // target
    <>
      <circle cx="115" cy="100" r="72" />
      <circle cx="115" cy="100" r="44" />
      <circle cx="115" cy="100" r="15" fill="currentColor" stroke="none" />
    </>
  ),
  "/appointments": ( // calendar with a check
    <>
      <rect x="40" y="48" width="140" height="112" rx="14" />
      <path d="M40 84 L180 84" />
      <path d="M74 34 L74 60 M146 34 L146 60" />
      <path d="M86 120 L106 140 L142 100" />
    </>
  ),
  "/calendar": ( // calendar grid
    <>
      <rect x="34" y="46" width="152" height="120" rx="14" />
      <path d="M34 82 L186 82" />
      <path d="M86 82 L86 166 M134 82 L134 166 M34 124 L186 124" />
      <path d="M72 32 L72 58 M148 32 L148 58" />
    </>
  ),
  "/clients": ( // two people
    <>
      <circle cx="82" cy="74" r="24" />
      <path d="M44 152 C 44 120, 120 120, 120 152" />
      <circle cx="152" cy="88" r="18" />
      <path d="M122 150 C 122 126, 184 126, 184 150" />
    </>
  ),
  "/projects": ( // folder
    <>
      <path d="M34 62 L96 62 L110 82 L186 82 L186 156 L34 156 Z" />
      <path d="M60 108 L162 108 M60 130 L128 130" />
    </>
  ),
  "/account-managers": ( // headset agent
    <>
      <circle cx="110" cy="88" r="30" />
      <path d="M72 92 a38 38 0 0 1 76 0" />
      <path d="M72 92 L72 110 M148 92 L148 110" />
      <path d="M76 156 C 76 120, 144 120, 144 156" />
      <path d="M148 106 L148 122 L128 122" />
    </>
  ),
  "/insurance-companies": ( // shield with check
    <>
      <path d="M110 36 L176 60 L176 106 C176 146 146 166 110 178 C74 166 44 146 44 106 L44 60 Z" />
      <path d="M84 104 L103 124 L140 82" />
    </>
  ),
  "/feedback": ( // speech bubble + heart
    <>
      <path d="M40 54 L180 54 L180 128 L112 128 L82 156 L82 128 L40 128 Z" />
      <path d="M110 118 C 82 98, 84 76, 101 76 C 110 76, 110 85, 110 90 C 110 85, 110 76, 119 76 C 136 76, 138 98, 110 118 Z" fill="currentColor" stroke="none" />
    </>
  ),
  "/qa": ( // clipboard with check
    <>
      <rect x="56" y="46" width="108" height="128" rx="12" />
      <rect x="90" y="36" width="40" height="22" rx="6" />
      <path d="M78 96 L92 110 L120 80" />
      <path d="M78 138 L146 138" />
    </>
  ),
  "/bulletin": ( // megaphone
    <>
      <path d="M44 92 L102 92 L162 58 L162 142 L102 108 L44 108 Z" />
      <path d="M102 108 L102 150 L120 150 L114 108" />
      <path d="M176 82 a22 22 0 0 1 0 38" />
    </>
  ),
  "/documents": ( // stacked documents
    <>
      <path d="M78 40 L172 40 L172 156" />
      <rect x="54" y="52" width="96" height="120" rx="10" />
      <path d="M74 92 L130 92 M74 114 L130 114 M74 136 L112 136" />
    </>
  ),
  "/imports": ( // down arrow into tray
    <>
      <path d="M110 54 L110 128 M84 100 L110 128 L136 100" />
      <path d="M50 148 L50 172 L170 172 L170 148" />
    </>
  ),
  "/reports": ( // bar chart
    <>
      <path d="M34 42 L34 164 L200 164" strokeWidth="4" />
      <rect x="60" y="116" width="26" height="46" />
      <rect x="102" y="86" width="26" height="76" />
      <rect x="144" y="60" width="26" height="102" />
    </>
  ),
  "/alerts": ( // bell
    <>
      <path d="M80 132 C 80 96, 90 70, 117 70 C 144 70, 154 96, 154 132 L166 148 L68 148 Z" />
      <path d="M104 160 a13 13 0 0 0 26 0" />
      <circle cx="117" cy="62" r="5" fill="currentColor" stroke="none" />
    </>
  ),
  "/users": ( // shield with person
    <>
      <path d="M110 38 L172 62 L172 106 C172 144 144 162 110 174 C76 162 48 144 48 106 L48 62 Z" />
      <circle cx="110" cy="96" r="17" />
      <path d="M86 140 C 86 118, 134 118, 134 140" />
    </>
  ),
  "/settings": ( // gear
    <>
      <circle cx="115" cy="100" r="42" />
      <circle cx="115" cy="100" r="18" />
      <path d="M115 40 L115 58 M115 142 L115 160 M55 100 L73 100 M157 100 L175 100 M72 57 L85 70 M145 130 L158 143 M158 57 L145 70 M85 130 L72 143" />
    </>
  ),
  default: ( // beacon signal
    <>
      <circle cx="110" cy="150" r="6" fill="currentColor" stroke="none" />
      <path d="M80 132 a42 42 0 0 1 60 0" />
      <path d="M60 112 a70 70 0 0 1 100 0" />
      <path d="M40 92 a98 98 0 0 1 140 0" />
    </>
  ),
};

export default function PageMotif({ path, className }) {
  const base = "/" + (path?.split("/")[1] || "");
  const motif = MOTIFS[base] || MOTIFS.default;
  return (
    <svg viewBox="0 0 220 200" fill="none" className={className} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {motif}
      </g>
    </svg>
  );
}
