import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const pin = (label, color) =>
  L.divIcon({
    className: "",
    html: `<div style="background:${color};width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);color:#fff;font-size:11px;font-weight:700">${label}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });

function Fit({ from, to, route }) {
  const map = useMap();
  useEffect(() => {
    const pts = [from, to, ...route].filter(Boolean);
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [60, 60] });
  }, [from, to, route]);
  return null;
}

export default function DeliveryMap({ from, to, route }) {
  const center = from || to || [-20.9106, -54.6361];
  const path = useMemo(() => (route || []).map(([lng, lat]) => [lat, lng]), [route]);
  return (
    <MapContainer center={center} zoom={14} scrollWheelZoom={false} className="w-full h-[420px] rounded-2xl overflow-hidden relative z-0">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
      <Fit from={from} to={to} route={path} />
      {from && <Marker position={from} icon={pin("L", "#1f6f43")} />}
      {to && <Marker position={to} icon={pin("C", "#c9531f")} />}
      {path.length > 1 && <Polyline positions={path} pathOptions={{ color: "#1f6f43", weight: 5, opacity: 0.85 }} />}
    </MapContainer>
  );
}