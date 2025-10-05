import { useEffect, useRef, useState } from "react";
import OpenSeadragon from "openseadragon";

const MIN_LEVEL = 1;   // tens níveis 1..12
const MAX_LEVEL = 12;

async function loadDzi(dataset) {
  const res = await fetch(`/assets/${dataset}/${dataset}.dzi`, { cache: "no-store" });
  if (!res.ok) throw new Error(`DZI não encontrado: ${dataset}`);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const image = doc.querySelector("Image");
  const size = doc.querySelector("Size");
  if (!image || !size) throw new Error("DZI inválido");
  const tileSize = parseInt(image.getAttribute("TileSize") || "256", 10);
  const overlap = parseInt(image.getAttribute("Overlap") || "0", 10);
  let format = (image.getAttribute("Format") || "jpg").toLowerCase();
  if (format === "jpeg") format = "jpg"; // normalizar
  const width = parseInt(size.getAttribute("Width"), 10);
  const height = parseInt(size.getAttribute("Height"), 10);
  return { width, height, tileSize, overlap, format };
}

export default function App() {
  const [dataset, setDataset] = useState("super-venus"); // muda aqui
  const viewerEl = useRef(null);
  const osdRef = useRef(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr("");
      const { width, height, tileSize, overlap, format } = await loadDzi(dataset);

      // destruir instância anterior
      if (osdRef.current) {
        try { osdRef.current.destroy(); } catch {}
        osdRef.current = null;
      }

      // Tile source custom que aponta para /tiles/{z}/{x}_{y}.{ext}
      const tileSource = {
        width,
        height,
        tileWidth: tileSize,
        tileHeight: tileSize,
        tileOverlap: overlap,
        minLevel: MIN_LEVEL,
        maxLevel: MAX_LEVEL,
        getTileUrl(level, x, y) {
          return `/assets/${dataset}/tiles/${level}/${x}_${y}.${format}`;
        },
      };

      const viewer = OpenSeadragon({
        element: viewerEl.current,
        prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.1/images/",
        showNavigator: true,
        navigatorPosition: "BOTTOM_RIGHT",
        showZoomControl: true,
        showHomeControl: true,
        maxZoomPixelRatio: 2,
        // importante para o teu range de níveis:
        minZoomLevel: MIN_LEVEL,
        // isto impede tentar níveis acima:
        // (o maxLevel real é controlado pelo tileSource.maxLevel)
        visibilityRatio: 1,
        // carrega o nosso tile source
        tileSources: [tileSource],
      });

      // Logs úteis
      viewer.addHandler("open-failed", (e) => setErr(`open-failed: ${e?.message || ""}`));
      viewer.addHandler("tile-load-failed", (e) => {
        console.warn("tile-load-failed:", e.tile?.url);
      });

      osdRef.current = viewer;
    })().catch((e) => alive && setErr(String(e)));

    return () => { alive = false; };
  }, [dataset]);

  return (
    <div style={{ height: "100vh", width: "100vw", background: "#000" }}>
      <div style={hudStyle}>
        <label>
          Dataset:&nbsp;
          <select value={dataset} onChange={(e) => setDataset(e.target.value)}>
            <option value="super-venus">super-venus</option>
            {/* <option value="outro">outro</option> */}
          </select>
        </label>
        {err && <span style={{ color: "#f55", marginLeft: 12 }}>{err}</span>}
      </div>
      <div ref={viewerEl} id="osd" style={{ height: "100%", width: "100%" }} />
    </div>
  );
}

const hudStyle = {
  position: "absolute",
  zIndex: 10,
  top: 12,
  left: 12,
  background: "rgba(20,20,20,.75)",
  padding: "8px 10px",
  borderRadius: 8,
  color: "#fff",
  border: "1px solid rgba(255,255,255,.1)",
  backdropFilter: "blur(4px)",
};
