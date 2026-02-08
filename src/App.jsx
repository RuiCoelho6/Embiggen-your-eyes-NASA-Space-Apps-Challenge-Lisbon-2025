import { useEffect, useRef, useState } from "react";
import OpenSeadragon from "openseadragon";
import "./App.css";

const MIN_LEVEL = 1;

function calculateMaxLevel(width, height, tileSize) {
  const maxDim = Math.max(width, height);
  const maxLevel = Math.ceil(Math.log2(maxDim / tileSize)) + MIN_LEVEL;
  return maxLevel + 8;
}

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
  if (format === "jpeg") format = "jpg";

  const width = parseInt(size.getAttribute("Width"), 10);
  const height = parseInt(size.getAttribute("Height"), 10);
  const maxLevel = calculateMaxLevel(width, height, tileSize);
  return { width, height, tileSize, overlap, format, maxLevel };
}

/** Same coordinates as before */
const pinsByDataset = {
  "asteroid-psyche": [
    { id: "psy1", title: "Large Impact Basin", message: "Massive crater exposing metal-rich interior.", x: 0.45, y: 0.55 },
    { id: "psy2", title: "Nickel–Iron Composition", message: "Unusually metal-rich (iron & nickel).", x: 0.62, y: 0.38 },
    { id: "psy3", title: "NASA Psyche Mission", message: "Launched 2023; arrival 2029.", x: 0.25, y: 0.20 },
  ],
  "super-venus": [
    { id: "sv1", title: "Super-Venus Clouds", message: "Thick sulfuric-acid clouds reflect sunlight.", x: 0.52, y: 0.28 },
    { id: "sv2", title: "Runaway Greenhouse", message: "Extreme temps from dense CO₂ atmosphere.", x: 0.37, y: 0.62 },
  ],
  galaxy: [
    { id: "gx1", title: "Spiral Arm", message: "High density of young stars & nebulae.", x: 0.70, y: 0.45 },
    { id: "gx2", title: "Galactic Core", message: "Bright bulge with older stars.", x: 0.50, y: 0.50 },
  ],
};

function markerSVG() {
  return `
<svg viewBox="0 0 64 64" class="gm-pin-svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M32 4c-12.7 0-23 10.3-23 23 0 13.6 16.6 30.7 21.7 35.8a1.8 1.8 0 0 0 2.6 0C38.4 57 55 40 55 27 55 14.3 44.7 4 32 4z" fill="#EA4335"/>
  <circle cx="32" cy="27" r="9" fill="#fff"/>
</svg>`;
}

export default function App() {
  const [dataset, setDataset] = useState("super-venus");
  const [datasets, setDatasets] = useState([]);
  const viewerEl = useRef(null);
  const osdRef = useRef(null);
  const pinsLayerRef = useRef(null);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/datasets");
        if (res.ok) {
          const data = await res.json();
          setDatasets(data.datasets || []);
          if (data.datasets?.length && !data.datasets.includes(dataset)) {
            setDataset(data.datasets[0]);
          }
        } else {
          setDatasets(["super-venus", "galaxy", "asteroid-psyche"]);
        }
      } catch {
        setDatasets(["super-venus", "galaxy", "asteroid-psyche"]);
      }
    })();
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(""); setInfo("");

      try {
        const { width, height, tileSize, overlap, format, maxLevel } = await loadDzi(dataset);
        if (!alive) return;

        setInfo(`${width}×${height} | Levels: ${MIN_LEVEL}–${maxLevel}`);

        if (osdRef.current) {
          try { osdRef.current.destroy(); } catch {}
          osdRef.current = null;
        }

        let pinsLayer = pinsLayerRef.current;
        if (!pinsLayer) {
          pinsLayer = document.createElement("div");
          pinsLayer.className = "gm-pins-layer";
          pinsLayerRef.current = pinsLayer;
        } else {
          pinsLayer.innerHTML = "";
        }

        const viewer = OpenSeadragon({
          element: viewerEl.current,
          prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.1/images/",
          showNavigator: true,
          navigatorPosition: "BOTTOM_RIGHT",

          // 🧹 hide all OpenSeadragon UI buttons
          showZoomControl: false,
          showHomeControl: false,
          showFullPageControl: false,
          showRotationControl: false,

          maxZoomPixelRatio: 2,
          minZoomLevel: 0.5,
          visibilityRatio: 1,

          gestureSettingsMouse: {
            clickToZoom: false,
            dblClickToZoom: false,
            dragToPan: true,
            scrollToZoom: true,
          },

          tileSources: [{
            width, height,
            tileWidth: tileSize, tileHeight: tileSize,
            tileOverlap: overlap,
            minLevel: MIN_LEVEL, maxLevel,
            getTileUrl(level, x, y) {
              return `/assets/${dataset}/tiles/${level}/${x}_${y}.${format}`;
            },
          }],
        });

        viewer.addOnceHandler("open", () => {
          viewer.container.appendChild(pinsLayer);
        });

        const pins = pinsByDataset[dataset] || [];
        const pinElements = [];

        pins.forEach((pin) => {
          const btn = document.createElement("button");
          btn.className = "gm-pin-btn";
          btn.type = "button";
          btn.setAttribute("aria-label", pin.title);
          btn.innerHTML = markerSVG();

          // Toggle only this pin's tooltip (others stay open)
          btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const existing = btn.querySelector(".tooltip");
            if (existing) {
              existing.remove();
            } else {
              const tip = document.createElement("div");
              tip.className = "tooltip";
              tip.innerHTML = `<strong>${pin.title}</strong><p>${pin.message}</p>`;
              btn.appendChild(tip);
            }
          });

          pinsLayer.appendChild(btn);
          pinElements.push({ el: btn, pin });
        });

        function updatePinPositions() {
          if (!viewer || !viewer.viewport) return;
          pinElements.forEach(({ el, pin }) => {
            const imgPt = new OpenSeadragon.Point(pin.x * width, pin.y * height);
            const vpPt = viewer.viewport.imageToViewportCoordinates(imgPt);
            const pxPt = viewer.viewport.pixelFromPoint(vpPt, true);
            el.style.transform = `translate(${pxPt.x}px, ${pxPt.y}px) translate(-50%, -100%)`;
          });
        }

        ["open", "animation", "resize", "zoom", "pan"].forEach((ev) =>
          viewer.addHandler(ev, updatePinPositions)
        );

        // Close all on real empty click, not pan
        viewer.addHandler("canvas-click", (e) => {
          if (e.quick) document.querySelectorAll(".tooltip").forEach((t) => t.remove());
        });

        viewer.addOnceHandler("open", updatePinPositions);
        if (alive) osdRef.current = viewer;
      } catch (e) {
        if (alive) setErr(String(e));
      }
    })();

    return () => { alive = false; };
  }, [dataset]);

  return (
    <div style={{ height: "100vh", width: "100vw", background: "#000" }}>
      <div style={hudStyle}>
        <label>
          Dataset:&nbsp;
          <select value={dataset} onChange={(e) => setDataset(e.target.value)}>
            {datasets.length === 0 ? (
              <option value="">Loading...</option>
            ) : (
              datasets.map((ds) => <option key={ds} value={ds}>{ds}</option>)
            )}
          </select>
        </label>
        {info && <span style={{ color: "#8f8", marginLeft: 12, fontSize: 12 }}>{info}</span>}
        {err && <span style={{ color: "#f55", marginLeft: 12 }}>{err}</span>}
      </div>

      <div ref={viewerEl} id="osd" style={{ height: "100%", width: "100%", position: "relative" }} />
    </div>
  );
}

const hudStyle = {
  position: "absolute",
  zIndex: 10,
  top: 12, left: 12,
  background: "rgba(20,20,20,.85)",
  padding: "8px 12px",
  borderRadius: 8,
  color: "#fff",
  border: "1px solid rgba(255,255,255,.15)",
  backdropFilter: "blur(8px)",
};
