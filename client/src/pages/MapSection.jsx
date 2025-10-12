import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, GeoJSON } from "react-leaflet";
import L from "leaflet";
import { IMAGES } from "../config/images";

import { Header } from "../components/Header";
import { Navigation } from "../components/Navigation";
import { Footer } from "../components/Footer";
import { calculateArea, formatAreaForDisplay } from "../utils/areaCalculator";
import { useNotification } from "../components/Notification";
import { AuthData } from "../context/AuthProvider";
import "leaflet/dist/leaflet.css";
import { getAllZones } from "../api/zones";
import { createZone, updateZone, deleteZone } from "../api/zones";
import {
    AlertDialog,
    AlertDialogTrigger,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from "../components/ui/alert-dialog";

// Provider styling helpers
const PROVIDERS = [
    { name: "Waymo", color: "#00E89D", logoKey: "Waymo", aliases: ["waymo", "google"] },
    { name: "Tesla", color: "#E82127", logoKey: "Tesla", aliases: ["tesla"] },
    { name: "Cruise", color: "#FF4C3F", logoKey: "Cruise", aliases: ["cruise", "gm", "general motors"] },
    { name: "Zoox", color: "#000000", logoKey: "Zoox", aliases: ["zoox", "amazon"] },
    { name: "Baidu", color: "#2830E1", logoKey: "Baidu", aliases: ["baidu", "apollogo"] },
    { name: "Pony.ai", color: "#97DBE5", logoKey: "Ponyai", aliases: ["ponyai"] },
    { name: "WeRide", color: "#00C8C8", logoKey: "WeRide", aliases: ["weride"] },
    { name: "Lyft", color: "#FF00BF", logoKey: "lyft", aliases: ["Lyft"] },
    { name: "Uber", color: "#010202", logoKey: "Uber", aliases: ["uber"] },
    { name: "Lucid", color: "#000000", logoKey: "Lucid", aliases: ["lucid"] },
    { name: "May Mobility", color: "#369141", logoKey: "May", aliases: ["may", "may mobility"] },
];
const getDeterministicColor = (input) => {
    const str = String(input || "");
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 45%)`;
};

const getProviderStyle = (providerName) => {
    const original = String(providerName || "");
    const lower = original.toLowerCase();

    for (const p of PROVIDERS) {
        if (p.aliases.some((alias) => lower.includes(alias))) {
            return {
                color: p.color,
                logo: IMAGES.PROVIDER_LOGOS[p.logoKey],
                providerName: p.name,
            };
        }
    }

    return { color: getDeterministicColor(original), logo: null, providerName: original || "Provider" };
};

const getProviderColor = (providerName) => {
    const lower = String(providerName || "").toLowerCase();
    for (const p of PROVIDERS) {
        if (p.aliases.some((alias) => lower.includes(alias))) return p.color;
    }
    return getDeterministicColor(providerName);
};

const getInitials = (name) => {
    const n = String(name || "").trim();
    if (!n) return "?";
    const parts = n.split(/\s+/);
    const initials = (parts[0]?.[0] || "").toUpperCase() + (parts[1]?.[0] || "").toUpperCase();
    return initials || n.slice(0, 2).toUpperCase();
};

// Normalize various GeoJSON shapes to a single Feature for API
const normalizeToFeature = (input) => {
    try {
        const value = typeof input === "string" ? JSON.parse(input) : input;
        if (!value || typeof value !== "object") return null;
        // If already a Feature
        if (value.type === "Feature" && value.geometry && value.geometry.type && Array.isArray(value.geometry.coordinates)) {
            return value;
        }
        // If a FeatureCollection, pick the first feature
        if (value.type === "FeatureCollection" && Array.isArray(value.features) && value.features.length > 0) {
            const first = value.features[0];
            if (first && first.type === "Feature" && first.geometry) return first;
        }
        // If a raw Geometry object
        if (value.type && value.coordinates && !value.geometry) {
            return { type: "Feature", properties: {}, geometry: { type: value.type, coordinates: value.coordinates } };
        }
        return null;
    } catch {
        return null;
    }
};

// Component to handle center updates without overriding user zoom
const MapUpdater = ({ center }) => {
    const map = useMap();

    useEffect(() => {
        map.setView(center, map.getZoom());
    }, [map, center]);

    return null;
};

// Keep mapZoom state synced with user interactions
const ZoomListener = ({ onZoomChange }) => {
    const map = useMap();
    useEffect(() => {
        const handler = () => onZoomChange(map.getZoom());
        map.on("zoomend", handler);
        return () => map.off("zoomend", handler);
    }, [map, onZoomChange]);
    return null;
};

// Helper functions for conditional styling
// Deprecated: replaced by getProviderColor and inline style usage in the table
// const getCompanyStyle = (company) => {
//     const name = String(company || "").toLowerCase();
//     if (name.includes("tesla")) return "text-[#E82127] font-semibold";
//     if (name.includes("waymo")) return "text-[#00E89D] font-semibold";
//     return "text-purple-900";
// };

const getCountryStyle = (country) => {
    const name = String(country || "").toLowerCase();
    if (name.includes("usa") || name.includes("united states")) return "text-blue-600 font-medium";
    if (name.includes("china")) return "text-red-600 font-medium";
    if (name.includes("europe")) return "text-green-600 font-medium";
    if (name.includes("middle east")) return "text-purple-600 font-medium";
    if (name.includes("japan")) return "text-yellow-600 font-medium";
    return "text-purple-900";
};

const getOperationalModelStyle = (model) => {
    const name = String(model || "").toLowerCase();
    if (name.includes("human-monitored")) return "text-red-400 font-medium";
    if (name.includes("driverless")) return "text-green-400 font-medium";
    if (name.includes("remote-assist")) return "text-yellow-500 font-medium";
    return "text-purple-900";
};

const getServiceStatusStyle = (status) => {
    const name = String(status || "").toLowerCase();
    if (name.includes("available")) return "text-green-400 font-medium";
    if (name.includes("limited")) return "text-yellow-500 font-medium";
    if (name.includes("suspended")) return "text-red-400 font-medium";
    if (name.includes("pilot")) return "text-purple-400 font-medium";
    if (name.includes("testing")) return "text-blue-400 font-medium";
    return "text-purple-900";
};

// (Clustered logo markers removed as we now render single markers per zone)

export const MapSection = () => {
    const { user } = AuthData();
    const [mapCenter, setMapCenter] = useState([35, -100]); // Default USA
    const [mapZoom, setMapZoom] = useState(4);
    const [userLocation, setUserLocation] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const mapRef = useRef(null);
    const [zones, setZones] = useState([]);
    // Removed legacy single filter in favor of per-column filters
    const [colFilters, setColFilters] = useState({
        company: "",
        city: "",
        country: "",
    });
    const [sortBy, setSortBy] = useState({ key: "company", dir: "asc" });
    const [editingId, setEditingId] = useState(null);
    const [editDrafts, setEditDrafts] = useState({});
    const [newDraft, setNewDraft] = useState({
        company: "",
        city: "",
        country: "",
    });
    const [saving, setSaving] = useState(false);
    const [showCreateRow, setShowCreateRow] = useState(false);
    const [NotificationElement, showNotification] = useNotification();

    // Load zones from API instead of local GeoJSON files
    useEffect(() => {
        const loadZonesFromApi = async () => {
            try {
                const apiResult = await getAllZones();
                const zones = Array.isArray(apiResult?.data) ? apiResult.data : Array.isArray(apiResult) ? apiResult : [];
                const processed = zones
                    .map((zone) => {
                        try {
                            const geo = typeof zone.coordinates === "string" ? JSON.parse(zone.coordinates) : zone.coordinates;
                            const tmp = L.geoJSON(geo);
                            const bounds = tmp.getBounds();
                            if (!bounds || !bounds.isValid()) return null;
                            const center = bounds.getCenter();

                            // Determine provider/company name
                            const nameStr = `${zone.name || zone.id || ""}`;
                            const providerRaw = zone.company || zone.provider || nameStr;
                            const { color, logo, providerName } = getProviderStyle(providerRaw);

                            return {
                                // Render fields
                                id: zone.id || zone._id || nameStr,
                                providerId: String(providerName || "").toLowerCase(),
                                providerName: providerName,
                                logo: logo,
                                color: color,
                                name: zone.name || nameStr,
                                data: geo,
                                bounds: bounds,
                                center: center,
                                // Original DB fields for table CRUD
                                company: zone.company || providerName,
                                city: zone.city || "",
                                country: zone.country || "",
                                operational_model: zone.operational_model || "",
                                service_status: zone.service_status || "",
                                fleet_size: zone.fleet_size ?? "",
                                coordinatesRaw: zone.coordinates, // keep raw for editing
                                created_at: zone.created_at,
                                updated_at: zone.updated_at,
                            };
                        } catch (e) {
                            console.error("Failed to parse zone coordinates", zone, e);
                            return null;
                        }
                    })
                    .filter(Boolean);

                setZones(processed);
            } catch (err) {
                console.error("Error fetching zones:", err);
            }
        };

        loadZonesFromApi();
    }, []);

    const handleSort = (key) => {
        setSortBy((prev) => ({ key, dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc" }));
    };

    const sortedFilteredZones = zones
        .filter((z) => {
            const f = colFilters;
            const textMatch = (val, q) =>
                String(val ?? "")
                    .toLowerCase()
                    .includes(String(q ?? "").toLowerCase());
            return textMatch(z.company, f.company) && textMatch(z.city, f.city) && textMatch(z.country, f.country);
        })
        .sort((a, b) => {
            const { key, dir } = sortBy;
            // Special-case: computed area
            if (key === "area") {
                const aArea = a.data ? Number(calculateArea(a.data)?.squareMeters || 0) : 0;
                const bArea = b.data ? Number(calculateArea(b.data)?.squareMeters || 0) : 0;
                return dir === "asc" ? aArea - bArea : bArea - aArea;
            }

            const av = a[key];
            const bv = b[key];
            if (av == null && bv == null) return 0;
            if (av == null) return dir === "asc" ? -1 : 1;
            if (bv == null) return dir === "asc" ? 1 : -1;
            if (typeof av === "number" && typeof bv === "number") return dir === "asc" ? av - bv : bv - av;
            return dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
        });

    const startEdit = (zone) => {
        setEditingId(zone.id);
        setEditDrafts({
            id: zone.id,
            company: zone.company || "",
            city: zone.city || "",
            country: zone.country || "",
            operational_model: zone.operational_model || "",
            service_status: zone.service_status || "",
            fleet_size: zone.fleet_size ?? "",
            coordinates: typeof zone.coordinatesRaw === "string" ? zone.coordinatesRaw : JSON.stringify(zone.coordinatesRaw, null, 2),
            name: zone.name || "",
        });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditDrafts({});
    };

    const saveEdit = async () => {
        if (!editingId) return;
        setSaving(true);
        try {
            // Ensure coordinates are an object per API contract
            const coordinatesObj = (() => {
                const val = editDrafts.coordinates;
                if (typeof val === "string") {
                    try {
                        return JSON.parse(val);
                    } catch {
                        return null;
                    }
                }
                return val || null;
            })();

            const payload = {
                company: editDrafts.company,
                city: editDrafts.city,
                country: editDrafts.country,
                operational_model: editDrafts.operational_model,
                service_status: editDrafts.service_status,
                fleet_size: Number(editDrafts.fleet_size) || 0,
                coordinates: coordinatesObj,
                name: editDrafts.name,
            };
            // Persist to server first
            await updateZone(editingId, payload);

            // Recompute client-side derived fields from edited values
            const provider = getProviderStyle(payload.company);
            let geo = null;
            let bounds = null;
            let center = null;
            try {
                geo = payload.coordinates;
                if (geo) {
                    const tmp = L.geoJSON(geo);
                    bounds = tmp.getBounds();
                    center = bounds && bounds.isValid() ? bounds.getCenter() : null;
                }
            } catch {
                // keep geo as null if parsing fails; do not crash
            }
            setZones((prev) =>
                prev.map((z) =>
                    z.id === editingId
                        ? {
                              ...z,
                              ...payload,
                              coordinatesRaw: payload.coordinates,
                              providerId: String(provider.providerName || "").toLowerCase(),
                              providerName: provider.providerName,
                              color: provider.color,
                              logo: provider.logo,
                              // Map derived fields
                              data: geo ?? z.data,
                              bounds: bounds ?? z.bounds,
                              center: center ?? z.center,
                          }
                        : z
                )
            );
            setEditingId(null);
            setEditDrafts({});
            showNotification("Zone updated successfully", "success");
        } catch (e) {
            console.error("Failed to save zone:", e);
            const serverMsg = e?.response?.data?.message || e?.message || "Failed to update zone";
            showNotification(serverMsg, "error");
        } finally {
            setSaving(false);
        }
    };

    const createNew = async () => {
        setSaving(true);
        try {
            const coordinatesFeature = normalizeToFeature(newDraft.coordinates);

            // Validate we ended up with a single Feature with geometry
            if (!coordinatesFeature || !coordinatesFeature.geometry || !coordinatesFeature.geometry.type) {
                showNotification("Invalid coordinates GeoJSON", "error");
                setSaving(false);
                return;
            }

            const payload = {
                company: newDraft.company,
                city: newDraft.city,
                country: newDraft.country,
                operational_model: newDraft.operational_model,
                service_status: newDraft.service_status,
                fleet_size: Number(newDraft.fleet_size) || 0,
                coordinates: coordinatesFeature,
            };
            const created = await createZone(payload);
            const provider = getProviderStyle(payload.company);
            const geo = coordinatesFeature;
            let bounds = null;
            let center = null;
            if (geo) {
                const tmp = L.geoJSON(geo);
                bounds = tmp.getBounds();
                center = bounds && bounds.isValid() ? bounds.getCenter() : null;
            }
            setZones((prev) => [
                ...prev,
                {
                    id: created?.id || created?._id || Math.random().toString(36).slice(2),
                    providerId: String(provider.providerName || "").toLowerCase(),
                    providerName: provider.providerName,
                    logo: provider.logo,
                    color: provider.color,
                    name: coordinatesFeature?.properties?.name || payload.company,
                    data: geo,
                    bounds: bounds,
                    center: center,
                    company: payload.company,
                    city: payload.city,
                    country: payload.country,
                    operational_model: payload.operational_model,
                    service_status: payload.service_status,
                    fleet_size: payload.fleet_size,
                    coordinatesRaw: payload.coordinates,
                },
            ]);
            setNewDraft({
                company: "",
                city: "",
                country: "",
                operational_model: "",
                service_status: "",
                fleet_size: "",
                coordinates: "",
                name: "",
            });
            setShowCreateRow(false);
            showNotification("Zone created successfully", "success");
        } catch (e) {
            console.error("Failed to create zone:", e);
            const serverMsg = e?.response?.data?.message || e?.message || "Failed to create zone";
            showNotification(serverMsg, "error");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            setSaving(true);
            await deleteZone(id);
            setZones((prev) => prev.filter((z) => z.id !== id));
            showNotification("Zone deleted", "success");
        } catch (e) {
            console.error("Failed to delete zone:", e);
            const serverMsg = e?.response?.data?.message || e?.message || "Failed to delete zone";
            showNotification(serverMsg, "error");
        } finally {
            setSaving(false);
        }
    };

    // Get user's current location
    const getCurrentLocation = () => {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by this browser.");
            return;
        }

        setIsLoading(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setUserLocation([latitude, longitude]);
                setMapCenter([latitude, longitude]);
                setMapZoom(15);
                setIsLoading(false);
            },
            (error) => {
                console.error("Error getting location:", error);
                alert("Unable to retrieve your location. Please try again.");
                setIsLoading(false);
            }
        );
    };

    // Legacy handleSearch removed; using Leaflet SearchControl instead

    return (
        <div className='min-h-screen bg-butter racing-font'>
            <Navigation color='text-purple-950' />
            <Header color='text-purple-950'>Available services</Header>

            {/* Main Content Container */}
            <div className='container mx-auto px-6 py-8'>
                <div className='max-w-7xl mx-auto'>
                    {/* Map Container */}
                    <div className='bg-butter rounded-2xl shadow-lg shadow-purple-950/20 overflow-hidden z-1 relative'>
                        {/* Control Buttons */}
                        <div className='absolute top-4 right-4 z-10 flex flex-col gap-2 items-end'>
                            <button
                                onClick={getCurrentLocation}
                                disabled={isLoading}
                                className='inline-flex items-center px-3 py-2 bg-purple-950 text-butter rounded-lg
                                        hover:bg-purple-800 transform hover:scale-105 transition-all duration-300 ease-out
                                        disabled:opacity-50 disabled:cursor-not-allowed text-sm'>
                                {isLoading ? (
                                    <>
                                        <i className='fa-solid fa-spinner fa-spin mr-2'></i>
                                        Locating...
                                    </>
                                ) : (
                                    <>
                                        <i className='fa-solid fa-location-crosshairs mr-2'></i>
                                        My Location
                                    </>
                                )}
                            </button>

                            <button
                                onClick={() => {
                                    setMapCenter([35, -100]);
                                    setMapZoom(4);
                                    setUserLocation(null);
                                }}
                                className='inline-flex items-center px-3 py-2 bg-purple-600 text-butter rounded-lg
                                        hover:bg-purple-700 transform hover:scale-105 transition-all duration-300 ease-out text-sm'>
                                <i className='fa-solid fa-globe mr-2'></i>
                                Reset
                            </button>
                        </div>
                        <div className='h-96 sm:h-[500px] md:h-[600px] lg:h-[700px]'>
                            <MapContainer
                                center={mapCenter}
                                zoom={mapZoom}
                                style={{ height: "100%", width: "100%" }}
                                scrollWheelZoom={true}
                                whenCreated={(m) => (mapRef.current = m)}
                                className='z-1'>
                                <MapUpdater center={mapCenter} />
                                <ZoomListener onZoomChange={setMapZoom} />
                                {/* Tile Layer */}
                                <TileLayer
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                    url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                                />
                                {mapZoom <= 9 &&
                                    zones.map((area) => (
                                        <Marker
                                            key={`${area.providerName}-${area.id}-marker`}
                                            position={area.center}
                                            icon={
                                                area.logo
                                                    ? L.icon({
                                                          iconUrl: area.logo,
                                                          iconSize: [36, 36],
                                                          iconAnchor: [18, 36],
                                                          popupAnchor: [0, -36],
                                                      })
                                                    : L.divIcon({
                                                          className: "provider-div-icon",
                                                          html: `<div style="background:${
                                                              area.color
                                                          };color:white;border-radius:6px;padding:4px 6px;font-weight:700;font-size:12px;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${getInitials(
                                                              area.providerName
                                                          )}</div>`,
                                                          iconSize: [28, 18],
                                                          iconAnchor: [14, 18],
                                                          popupAnchor: [0, -18],
                                                      })
                                            }
                                            eventHandlers={{
                                                click: (ev) => {
                                                    const map = ev.target._map;
                                                    if (area.bounds && area.bounds.isValid()) {
                                                        map.flyToBounds(area.bounds, { padding: [24, 24], duration: 1.0 });
                                                    } else if (area.center) {
                                                        map.flyTo(area.center, Math.max(map.getZoom(), 10), { duration: 1.0 });
                                                    }
                                                },
                                            }}>
                                            <Popup>
                                                <div className='text-center'>
                                                    <div className='font-semibold text-purple-900 mb-2'>{area.providerName}</div>
                                                    {area.data && (
                                                        <div className='text-sm text-gray-600'>
                                                            City: {area.city}
                                                            {", "}
                                                            {area.country}
                                                            <br />
                                                            Area: {formatAreaForDisplay(calculateArea(area.data))}
                                                        </div>
                                                    )}
                                                </div>
                                            </Popup>
                                        </Marker>
                                    ))}
                                {/* Waymo GeoJSON Areas when zoomed in, plus center icon */}
                                {mapZoom > 9 &&
                                    zones.map((layer) => {
                                        // Compute polygon center per layer for the centered icon
                                        let center = null;
                                        const tmp = L.geoJSON(layer.data);
                                        const b = tmp.getBounds && tmp.getBounds();
                                        if (b && b.isValid()) center = b.getCenter();
                                        return (
                                            <>
                                                <GeoJSON
                                                    key={`${layer.providerName}-${layer.id}-geo`}
                                                    data={layer.data}
                                                    style={{
                                                        color: layer.color,
                                                        weight: 2,
                                                        opacity: 0.9,
                                                        fillColor: layer.color,
                                                        fillOpacity: 0.2,
                                                    }}
                                                    onEachFeature={(_feature, lyr) => {
                                                        lyr.on("click", () => {
                                                            const map = lyr._map;
                                                            if (lyr.getBounds && lyr.getBounds().isValid()) {
                                                                map.flyToBounds(lyr.getBounds(), { padding: [24, 24], duration: 1.0 });
                                                            }
                                                        });
                                                    }}
                                                />
                                                {center && (
                                                    <Marker
                                                        key={`${layer.providerName}-${layer.id}-center`}
                                                        position={center}
                                                        icon={
                                                            layer.logo
                                                                ? L.icon({
                                                                      iconUrl: layer.logo,
                                                                      iconSize: [28, 28],
                                                                      iconAnchor: [14, 28],
                                                                      popupAnchor: [0, -28],
                                                                  })
                                                                : L.divIcon({
                                                                      className: "provider-div-icon",
                                                                      html: `<div style="background:${
                                                                          layer.color
                                                                      };color:white;border-radius:6px;padding:3px 5px;font-weight:700;font-size:11px;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${getInitials(
                                                                          layer.providerName
                                                                      )}</div>`,
                                                                      iconSize: [26, 16],
                                                                      iconAnchor: [13, 16],
                                                                      popupAnchor: [0, -16],
                                                                  })
                                                        }>
                                                        <Popup>
                                                            <div className='text-center'>
                                                                <div className='font-semibold text-purple-900 mb-2'>
                                                                    {layer.providerName}
                                                                </div>
                                                                {layer.data && (
                                                                    <div className='text-sm text-gray-600'>
                                                                        City: {layer.city}
                                                                        {", "}
                                                                        {layer.country}
                                                                        <br />
                                                                        Area: {formatAreaForDisplay(calculateArea(layer.data))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </Popup>
                                                    </Marker>
                                                )}
                                            </>
                                        );
                                    })}
                                {/* User Location Marker */}
                                {userLocation && (
                                    <Marker position={userLocation}>
                                        <Popup>
                                            <div className='text-center'>
                                                <i className='fa-solid fa-user text-blue-600 text-lg mb-2'></i>
                                                <p className='font-semibold text-purple-900'>Your Location</p>
                                            </div>
                                        </Popup>
                                    </Marker>
                                )}
                            </MapContainer>
                        </div>
                    </div>

                    {/* Zones Table */}
                    <div className='bg-butter rounded-2xl shadow-lg shadow-purple-950/20 p-6 mt-8'>
                        <div className='flex flex-col gap-3 mb-4'>
                            <h3 className='text-lg font-bold text-purple-900'>Zones</h3>
                            <div className='w-full'>
                                <span className='text-purple-800 font-medium text-xs sm:text-sm md:text-base'>Filters:</span>
                                <div className='grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2 sm:gap-3 md:gap-4 w-full'>
                                    <input
                                        value={colFilters.company}
                                        onChange={(e) => setColFilters({ ...colFilters, company: e.target.value })}
                                        placeholder='Company'
                                        className='w-full min-w-0 px-3 py-2 rounded-md border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400 text-xs sm:text-sm'
                                    />
                                    <input
                                        value={colFilters.city}
                                        onChange={(e) => setColFilters({ ...colFilters, city: e.target.value })}
                                        placeholder='City'
                                        className='w-full min-w-0 px-3 py-2 rounded-md border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400 text-xs sm:text-sm'
                                    />
                                    <input
                                        value={colFilters.country}
                                        onChange={(e) => setColFilters({ ...colFilters, country: e.target.value })}
                                        placeholder='Country/Zone'
                                        className='w-full min-w-0 px-3 py-2 rounded-md border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400 text-xs sm:text-sm'
                                    />
                                </div>
                            </div>
                        </div>
                        <div className='overflow-x-auto'>
                            <table className='min-w-full text-xs sm:text-sm lg:text-base text-purple-900'>
                                <thead>
                                    <tr className='text-left border-b bg-purple-950 text-butter sticky top-0 z-10 text-[11px] sm:text-xs md:text-sm lg:text-base'>
                                        <th
                                            className='py-2 px-2 cursor-pointer select-none w-24 min-w-[80px]'
                                            onClick={() => handleSort("company")}>
                                            Company{" "}
                                            <span className='text-xs'>
                                                {sortBy.key === "company" ? (sortBy.dir === "asc" ? "↓" : "↑") : "⇅"}
                                            </span>
                                        </th>
                                        <th
                                            className='py-2 px-2 cursor-pointer select-none w-32 min-w-[120px]'
                                            onClick={() => handleSort("city")}>
                                            City{" "}
                                            <span className='ml-1 text-xs'>
                                                {sortBy.key === "city" ? (sortBy.dir === "asc" ? "↓" : "↑") : "⇅"}
                                            </span>
                                        </th>
                                        <th
                                            className='py-2 px-2 cursor-pointer select-none w-24 min-w-[80px]'
                                            onClick={() => handleSort("country")}>
                                            Zone{" "}
                                            <span className='ml-1 text-xs'>
                                                {sortBy.key === "country" ? (sortBy.dir === "asc" ? "↓" : "↑") : "⇅"}
                                            </span>
                                        </th>
                                        <th
                                            className='py-2 px-2 cursor-pointer select-none w-48 min-w-[180px]'
                                            onClick={() => handleSort("operational_model")}>
                                            Operational Model{" "}
                                            <span className='ml-1 text-xs'>
                                                {sortBy.key === "operational_model" ? (sortBy.dir === "asc" ? "↓" : "↑") : "⇅"}
                                            </span>
                                        </th>
                                        <th
                                            className='py-2 px-2 cursor-pointer select-none w-32 min-w-[140px]'
                                            onClick={() => handleSort("service_status")}>
                                            Service Status{" "}
                                            <span className='ml-1 text-xs'>
                                                {sortBy.key === "service_status" ? (sortBy.dir === "asc" ? "↓" : "↑") : "⇅"}
                                            </span>
                                        </th>
                                        <th
                                            className='py-2 px-2 cursor-pointer select-none w-28 min-w-[100px]'
                                            onClick={() => handleSort("fleet_size")}>
                                            Fleet Size{" "}
                                            <span className='ml-1 text-xs'>
                                                {sortBy.key === "fleet_size" ? (sortBy.dir === "asc" ? "↓" : "↑") : "⇅"}
                                            </span>
                                        </th>
                                        <th
                                            className='py-2 px-2 cursor-pointer select-none w-32 min-w-[120px]'
                                            onClick={() => handleSort("area")}>
                                            Area{" "}
                                            <span className='ml-1 text-xs'>
                                                {sortBy.key === "area" ? (sortBy.dir === "asc" ? "↓" : "↑") : "⇅"}
                                            </span>
                                        </th>
                                        {(editingId || showCreateRow) && (
                                            <th className='py-2 px-2 w-32 min-w-[120px]'>Coordinates (GeoJSON)</th>
                                        )}
                                        {user?.isLoggedIn && user?.isAdmin && <th className='py-2 px-2 w-36 min-w-[140px]'>Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedFilteredZones.map((z) => (
                                        <tr key={`row-${z.id}`} className='border-b border-purple-950 align-top'>
                                            <td className='py-2 px-2 text-md sm:text-lg w-24 min-w-[80px]'>
                                                {editingId === z.id ? (
                                                    <select
                                                        value={editDrafts.company}
                                                        onChange={(e) => setEditDrafts({ ...editDrafts, company: e.target.value })}
                                                        className='w-full px-2 py-1 border rounded text-xs sm:text-sm'>
                                                        {PROVIDERS.map((p) => (
                                                            <option key={p.name} value={p.name} style={{ color: p.color, fontWeight: 600 }}>
                                                                {p.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <span style={{ color: getProviderColor(z.company), fontWeight: 600 }}>{z.company}</span>
                                                )}
                                            </td>
                                            <td className='py-2 px-2 text-md sm:text-lg w-32 min-w-[120px]'>
                                                {editingId === z.id ? (
                                                    <input
                                                        value={editDrafts.city}
                                                        onChange={(e) => setEditDrafts({ ...editDrafts, city: e.target.value })}
                                                        className='w-full px-2 py-1 border rounded text-xs sm:text-sm'
                                                    />
                                                ) : (
                                                    z.city
                                                )}
                                            </td>
                                            <td className='py-2 px-2 text-md sm:text-lg w-24 min-w-[80px]'>
                                                {editingId === z.id ? (
                                                    <select
                                                        value={editDrafts.country}
                                                        onChange={(e) => setEditDrafts({ ...editDrafts, country: e.target.value })}
                                                        className={`w-full px-2 py-1 border rounded text-xs sm:text-sm ${getCountryStyle(
                                                            editDrafts.country
                                                        )}`}>
                                                        <option value='USA' className='text-blue-600'>
                                                            USA
                                                        </option>
                                                        <option value='China' className='text-red-600'>
                                                            China
                                                        </option>
                                                        <option value='Europe' className='text-green-600'>
                                                            Europe
                                                        </option>
                                                        <option value='Middle East' className='text-purple-600'>
                                                            Middle East
                                                        </option>
                                                        <option value='Japan' className='text-yellow-600'>
                                                            Japan
                                                        </option>
                                                        <option value='Singapore' className='text-cyan-600'>
                                                            Singapore
                                                        </option>
                                                    </select>
                                                ) : (
                                                    <span className={getCountryStyle(z.country)}>{z.country}</span>
                                                )}
                                            </td>
                                            <td className='py-2 px-2 text-md sm:text-lg w-48 min-w-[180px]'>
                                                {editingId === z.id ? (
                                                    <select
                                                        value={editDrafts.operational_model}
                                                        onChange={(e) =>
                                                            setEditDrafts({ ...editDrafts, operational_model: e.target.value })
                                                        }
                                                        className={`w-full px-2 py-1 border rounded text-xs sm:text-sm ${getOperationalModelStyle(
                                                            editDrafts.operational_model
                                                        )}`}>
                                                        <option value='Human-monitored' className='text-red-400'>
                                                            Human-monitored
                                                        </option>
                                                        <option value='Driverless (Geofenced L4)' className='text-green-400'>
                                                            Driverless (Geofenced L4)
                                                        </option>
                                                        <option value='Remote-assist' className='text-yellow-500'>
                                                            Remote-assist
                                                        </option>
                                                        <option value='Undefined' className='text-gray-400'>
                                                            Undefined
                                                        </option>
                                                    </select>
                                                ) : (
                                                    <span className={getOperationalModelStyle(z.operational_model)}>
                                                        {z.operational_model}
                                                    </span>
                                                )}
                                            </td>
                                            <td className='py-2 px-2 text-md sm:text-lg w-32 min-w-[120px]'>
                                                {editingId === z.id ? (
                                                    <select
                                                        value={editDrafts.service_status}
                                                        onChange={(e) => setEditDrafts({ ...editDrafts, service_status: e.target.value })}
                                                        className={`w-full px-2 py-1 border rounded text-xs sm:text-sm ${getServiceStatusStyle(
                                                            editDrafts.service_status
                                                        )}`}>
                                                        <option value='Available' className='text-green-400'>
                                                            Available
                                                        </option>
                                                        <option value='Limited' className='text-yellow-500'>
                                                            Limited
                                                        </option>
                                                        <option value='Suspended' className='text-red-400'>
                                                            Suspended
                                                        </option>
                                                        <option value='Pilot' className='text-purple-400'>
                                                            Pilot
                                                        </option>
                                                        <option value='Testing' className='text-blue-400'>
                                                            Testing
                                                        </option>
                                                        <option value='Undefined' className='text-gray-400'>
                                                            Undefined
                                                        </option>
                                                    </select>
                                                ) : (
                                                    <span className={getServiceStatusStyle(z.service_status)}>{z.service_status}</span>
                                                )}
                                            </td>
                                            <td className='py-2 px-2 text-md sm:text-lg w-28 min-w-[100px]'>
                                                {editingId === z.id ? (
                                                    <input
                                                        type='number'
                                                        value={editDrafts.fleet_size}
                                                        onChange={(e) => setEditDrafts({ ...editDrafts, fleet_size: e.target.value })}
                                                        className='w-full px-2 py-1 border rounded text-xs sm:text-sm'
                                                    />
                                                ) : z.fleet_size === 0 || z.fleet_size === "" ? (
                                                    "Undefined"
                                                ) : (
                                                    z.fleet_size
                                                )}
                                            </td>
                                            <td className='py-2 px-2 text-md sm:text-lg w-32 min-w-[120px]'>
                                                {z.data ? (
                                                    <span className='text-purple-700 font-medium'>
                                                        {formatAreaForDisplay(calculateArea(z.data))}
                                                    </span>
                                                ) : (
                                                    <span className='text-gray-400'>-</span>
                                                )}
                                            </td>
                                            {editingId === z.id && (
                                                <td className='py-2 px-2 w-32 min-w-[120px]'>
                                                    <label className='w-full px-2 py-1 border rounded text-[12px] hover:cursor-pointer bg-purple-100 hover:bg-purple-200 transition-colors duration-200 flex items-center justify-center'>
                                                        <i className='fa-solid fa-upload mr-2'></i>
                                                        {editDrafts.coordinates &&
                                                        typeof editDrafts.coordinates === "string" &&
                                                        editDrafts.coordinatesName
                                                            ? editDrafts.coordinatesName
                                                            : "Upload GeoJSON"}
                                                        <input
                                                            type='file'
                                                            accept='.geojson,application/geo+json,application/json'
                                                            onChange={async (e) => {
                                                                const file = e.target.files && e.target.files[0];
                                                                if (!file) return;
                                                                const text = await file.text();
                                                                setEditDrafts({
                                                                    ...editDrafts,
                                                                    coordinates: text,
                                                                    coordinatesName: file.name,
                                                                });
                                                            }}
                                                            className='hidden'
                                                        />
                                                    </label>
                                                </td>
                                            )}
                                            {user?.isLoggedIn && user?.isAdmin && (
                                                <td className='py-2 px-2 w-36 min-w-[140px]'>
                                                    {editingId === z.id ? (
                                                        <div className='flex gap-2'>
                                                            <button
                                                                disabled={saving}
                                                                onClick={saveEdit}
                                                                className='px-3 py-1 bg-green-600 text-white rounded text-xs sm:text-sm'>
                                                                Save
                                                            </button>
                                                            <button
                                                                disabled={saving}
                                                                onClick={cancelEdit}
                                                                className='px-3 py-1 bg-gray-400 text-white rounded text-xs sm:text-sm'>
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className='flex items-center gap-2'>
                                                            <button
                                                                onClick={() => startEdit(z)}
                                                                className='px-3 py-1 bg-purple-700 text-white rounded text-xs sm:text-sm'>
                                                                Edit
                                                            </button>
                                                            <AlertDialog key={`delete-${z.id}`}>
                                                                <AlertDialogTrigger asChild>
                                                                    <button className='px-3 py-1 bg-red-600 text-white rounded text-xs sm:text-sm'>
                                                                        Delete
                                                                    </button>
                                                                </AlertDialogTrigger>
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader>
                                                                        <AlertDialogTitle>Delete zone?</AlertDialogTitle>
                                                                        <AlertDialogDescription>
                                                                            This action cannot be undone. This will permanently delete
                                                                            <span className='font-semibold'> {z.company}</span> zone.
                                                                        </AlertDialogDescription>
                                                                    </AlertDialogHeader>
                                                                    <AlertDialogFooter>
                                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                        <AlertDialogAction onClick={() => handleDelete(z.id)}>
                                                                            Delete
                                                                        </AlertDialogAction>
                                                                    </AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            </AlertDialog>
                                                        </div>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                                {showCreateRow && user?.isLoggedIn && user?.isAdmin && (
                                    <tfoot>
                                        <tr className='border-t border-purple-200'>
                                            <td className='py-2 px-2'>
                                                <select
                                                    value={newDraft.company}
                                                    onChange={(e) => setNewDraft({ ...newDraft, company: e.target.value })}
                                                    className='w-full px-2 py-1 border rounded text-xs sm:text-sm'>
                                                    <option value='' disabled>
                                                        Select company
                                                    </option>
                                                    {PROVIDERS.map((p) => (
                                                        <option key={p.name} value={p.name} style={{ color: p.color, fontWeight: 600 }}>
                                                            {p.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className='py-2 px-2'>
                                                <input
                                                    value={newDraft.city}
                                                    onChange={(e) => setNewDraft({ ...newDraft, city: e.target.value })}
                                                    placeholder='City'
                                                    className='w-full px-2 py-1 border rounded text-xs sm:text-sm'
                                                />
                                            </td>
                                            <td className='py-2 px-2'>
                                                <select
                                                    value={newDraft.country}
                                                    onChange={(e) => setNewDraft({ ...newDraft, country: e.target.value })}
                                                    className='w-full px-2 py-1 border rounded text-xs sm:text-sm'>
                                                    <option value='' disabled>
                                                        Select country
                                                    </option>
                                                    <option value='USA' className='text-blue-600'>
                                                        USA
                                                    </option>
                                                    <option value='China' className='text-red-600'>
                                                        China
                                                    </option>
                                                    <option value='Europe' className='text-green-600'>
                                                        Europe
                                                    </option>
                                                    <option value='Middle East' className='text-purple-600'>
                                                        Middle East
                                                    </option>
                                                    <option value='Japan' className='text-yellow-600'>
                                                        Japan
                                                    </option>
                                                    <option value='Singapore' className='text-cyan-600'>
                                                        Singapore
                                                    </option>
                                                </select>
                                            </td>
                                            <td className='py-2 px-2'>
                                                <select
                                                    value={newDraft.operational_model}
                                                    onChange={(e) => setNewDraft({ ...newDraft, operational_model: e.target.value })}
                                                    className='w-full px-2 py-1 border rounded text-xs sm:text-sm'>
                                                    <option value='' disabled>
                                                        Select operational model
                                                    </option>
                                                    <option value='Human-monitored' className='text-red-400'>
                                                        Human-monitored
                                                    </option>
                                                    <option value='Driverless (Geofenced L4)' className='text-green-400'>
                                                        Driverless (Geofenced L4)
                                                    </option>
                                                    <option value='Remote-assist' className='text-yellow-500'>
                                                        Remote-assist
                                                    </option>
                                                </select>
                                            </td>
                                            <td className='py-2 px-2'>
                                                <select
                                                    value={newDraft.service_status}
                                                    onChange={(e) => setNewDraft({ ...newDraft, service_status: e.target.value })}
                                                    className='w-full px-2 py-1 border rounded text-xs sm:text-sm'>
                                                    <option value='' disabled>
                                                        Select service status
                                                    </option>
                                                    <option value='Available' className='text-green-400'>
                                                        Available
                                                    </option>
                                                    <option value='Limited' className='text-yellow-500'>
                                                        Limited
                                                    </option>
                                                    <option value='Suspended' className='text-red-400'>
                                                        Suspended
                                                    </option>
                                                    <option value='Pilot' className='text-purple-400'>
                                                        Pilot
                                                    </option>
                                                    <option value='Testing' className='text-blue-400'>
                                                        Testing
                                                    </option>
                                                </select>
                                            </td>
                                            <td className='py-2 px-2'>
                                                <input
                                                    type='number'
                                                    value={newDraft.fleet_size}
                                                    onChange={(e) => setNewDraft({ ...newDraft, fleet_size: e.target.value })}
                                                    placeholder='Fleet size'
                                                    className='w-full px-2 py-1 border rounded text-xs sm:text-sm'
                                                />
                                            </td>
                                            <td className='py-2 px-2 w-32 min-w-[120px]'>
                                                <label className='w-full px-2 py-1 border rounded text-[12px] hover:cursor-pointer bg-purple-100 hover:bg-purple-200 transition-colors duration-200 flex items-center justify-center'>
                                                    <i className='fa-solid fa-upload mr-2'></i>
                                                    {newDraft.coordinatesName ? newDraft.coordinatesName : "Upload GeoJSON"}
                                                    <input
                                                        type='file'
                                                        accept='.geojson,application/geo+json,application/json'
                                                        onChange={async (e) => {
                                                            const file = e.target.files && e.target.files[0];
                                                            if (!file) return;
                                                            const text = await file.text();
                                                            setNewDraft({ ...newDraft, coordinates: text, coordinatesName: file.name });
                                                        }}
                                                        className='hidden'
                                                    />
                                                </label>
                                            </td>
                                            <td className='py-2 px-2'>
                                                <button
                                                    disabled={saving}
                                                    onClick={createNew}
                                                    className='px-3 py-1 bg-blue-700 text-white rounded text-xs sm:text-sm'>
                                                    Create
                                                </button>
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>
                    {user?.isLoggedIn && user?.isAdmin && (
                        <div className='flex justify-end mt-4'>
                            <button onClick={() => setShowCreateRow((s) => !s)} className='px-4 py-2 bg-blue-700 text-white rounded shadow'>
                                {showCreateRow ? "Hide new row" : "Add new zone"}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <Footer />
            {NotificationElement}
        </div>
    );
};
