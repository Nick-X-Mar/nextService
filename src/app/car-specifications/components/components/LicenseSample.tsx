/**
 * Schematic of a Greek άδεια κυκλοφορίας, drawn rather than photographed: it shows which
 * document to point the camera at and which boxes have to come out readable, without
 * shipping a picture of a real (or realistic) certificate. Values are dummies and the
 * whole thing is watermarked ΔΕΙΓΜΑ so it can never be mistaken for a document.
 *
 * The highlighted fields are exactly the ones we read off the photo — μάρκα, μοντέλο,
 * κυβισμός, καύσιμο, αριθμός πλαισίου and αριθμός κινητήρα.
 */
interface Field {
  code: string
  label: string
  value: string
  /** Marked in amber — one of the fields we actually need off the photo. */
  needed?: boolean
}

const FIELDS: Field[] = [
  { code: 'A', label: 'Αρ. κυκλοφοριας', value: 'ΑΒΓ 1234' },
  { code: 'B', label: '1η αδεια', value: '12.03.2015' },
  { code: 'D.1', label: 'Μαρκα', value: 'TOYOTA', needed: true },
  { code: 'D.3', label: 'Μοντελο', value: 'YARIS', needed: true },
  { code: 'E', label: 'Αρ. πλαισιου', value: 'VNK******', needed: true },
  { code: 'P.5', label: 'Αρ. κινητηρα', value: '1NZ******', needed: true },
  { code: 'P.1', label: 'Κυβισμος', value: '1329 cm³', needed: true },
  { code: 'P.3', label: 'Καυσιμο', value: 'ΒΕΝΖΙΝΗ', needed: true },
]

const COL_X = [12, 166]
const ROW_Y = [46, 84, 122, 160]

export default function LicenseSample({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 206"
      className={className}
      role="img"
      aria-label="Δείγμα ελληνικής άδειας κυκλοφορίας με σημειωμένα τα πεδία που χρειαζόμαστε"
    >
      {/* Document */}
      <rect x="0.5" y="0.5" width="319" height="205" rx="10" className="fill-surface-container-lowest stroke-outline-variant" strokeOpacity="0.5" />
      <path d="M0.5 10.5a10 10 0 0110-10h299a10 10 0 0110 10V32H0.5z" className="fill-surface-container-high" />
      <text x="12" y="21" className="fill-on-surface" fontSize="10" fontWeight="800" letterSpacing="0.5">
        ΑΔΕΙΑ ΚΥΚΛΟΦΟΡΙΑΣ
      </text>
      <rect x="252" y="8" width="56" height="16" rx="8" className="fill-primary" fillOpacity="0.12" />
      <text x="280" y="19.5" textAnchor="middle" className="fill-primary" fontSize="8" fontWeight="800" letterSpacing="1">
        ΔΕΙΓΜΑ
      </text>

      {/* Watermark, so this can never read as a real document */}
      <text
        x="160"
        y="128"
        textAnchor="middle"
        transform="rotate(-16 160 128)"
        className="fill-on-surface"
        fillOpacity="0.06"
        fontSize="46"
        fontWeight="900"
        letterSpacing="4"
      >
        ΔΕΙΓΜΑ
      </text>

      {FIELDS.map((f, i) => {
        const x = COL_X[i % 2]
        const y = ROW_Y[Math.floor(i / 2)]
        return (
          <g key={f.code}>
            {f.needed && (
              <>
                <rect x={x - 5} y={y - 12} width="147" height="32" rx="6" className="fill-primary" fillOpacity="0.08" />
                <rect x={x - 5} y={y - 12} width="2.5" height="32" rx="1.25" className="fill-primary-container" />
              </>
            )}
            <text x={x + 3} y={y} fontSize="7" fontWeight="800" className={f.needed ? 'fill-primary' : 'fill-on-surface-variant'} fillOpacity={f.needed ? 1 : 0.6}>
              {f.code}
            </text>
            <text x={x + 22} y={y} fontSize="6.5" fontWeight="700" letterSpacing="0.4" className="fill-on-surface-variant" fillOpacity="0.7">
              {f.label.toUpperCase()}
            </text>
            <text x={x + 3} y={y + 14} fontSize="10" fontWeight="800" className="fill-on-surface">
              {f.value}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
