import React, { useState } from 'react';
import { Camera, CheckCircle, Loader2, MapPin, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface MobileBrigadeCaptureProps {
  token: string;
}

interface BrigadeContext {
  record_id?: string | null;
  project_id?: string | null;
  title: string;
  territory_name?: string | null;
  responsible?: string | null;
  date?: string | null;
  territories?: BrigadeTerritory[];
}

interface BrigadeTerritory {
  id: string;
  name: string;
  type?: string | null;
}

interface BrigadeCoords {
  latitude: number;
  longitude: number;
}

export const MobileBrigadeCapture: React.FC<MobileBrigadeCaptureProps> = ({ token }) => {
  const [phone, setPhone] = useState('');
  const [context, setContext] = useState<BrigadeContext | null>(null);
  const [doors, setDoors] = useState(0);
  const [printed, setPrinted] = useState(0);
  const [members, setMembers] = useState(0);
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [territoryId, setTerritoryId] = useState('');
  const [captureDate, setCaptureDate] = useState(new Date().toISOString().slice(0, 10));
  const [coords, setCoords] = useState<BrigadeCoords | null>(null);
  const [geoStatus, setGeoStatus] = useState('GPS pendiente');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const captureLocation = async () => {
    if (!navigator.geolocation) {
      throw new Error('Este dispositivo no permite capturar GPS desde el navegador.');
    }

    setGeoStatus('Solicitando GPS...');
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      });
    });

    const nextCoords = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    };
    setCoords(nextCoords);
    setGeoStatus(`GPS capturado (${nextCoords.latitude.toFixed(5)}, ${nextCoords.longitude.toFixed(5)})`);
    return nextCoords;
  };

  const refreshLocation = async () => {
    setError(null);
    try {
      await captureLocation();
    } catch (locationError) {
      setGeoStatus('GPS no disponible');
      setError(locationError instanceof Error ? locationError.message : 'No se pudo capturar GPS.');
    }
  };

  const verifyChief = async (event: React.FormEvent) => {
    event.preventDefault();
    if (phone.replace(/\D/g, '').length < 6) {
      setError('Captura el teléfono del jefe de brigada.');
      return;
    }

    setIsLoading(true);
    setError(null);
    const { data, error: contextError } = await supabase.rpc('get_growth_brigade_context', {
      p_token: token,
      p_chief_phone: phone
    });

    if (contextError || !data?.[0]) {
      setError(contextError?.message || 'Enlace inválido o teléfono no autorizado.');
      setContext(null);
      setIsLoading(false);
      return;
    }

    const nextContext = data[0] as BrigadeContext;
    setContext(nextContext);
    if (!territoryId && nextContext.territories?.[0]?.id) {
      setTerritoryId(nextContext.territories[0].id);
    }
    if (!captureDate) {
      setCaptureDate(new Date().toISOString().slice(0, 10));
    }
    setIsLoading(false);
    void refreshLocation();
  };

  const uploadPhoto = async () => {
    if (!photo) return null;

    const extension = photo.name.split('.').pop() || 'jpg';
    const path = `${token}/${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('brigade-evidence')
      .upload(path, photo, { cacheControl: '3600', upsert: false });

    if (uploadError) throw uploadError;

    return supabase.storage.from('brigade-evidence').getPublicUrl(path).data.publicUrl;
  };

  const submitCapture = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      if (!territoryId) {
        throw new Error('Selecciona el territorio de la jornada.');
      }
      if (!captureDate) {
        throw new Error('Captura la fecha de la jornada.');
      }
      const position = coords || await captureLocation();
      const evidenceUrl = await uploadPhoto();
      const { error: submitError } = await supabase.rpc('submit_growth_brigade_capture', {
        p_token: token,
        p_chief_phone: phone,
        p_doors_knocked: Math.max(0, doors),
        p_printed_delivered: Math.max(0, printed),
        p_brigade_members: Math.max(0, members),
        p_latitude: position.latitude,
        p_longitude: position.longitude,
        p_territory_id: territoryId,
        p_capture_date: captureDate,
        p_evidence_url: evidenceUrl,
        p_notes: notes.trim() || null
      });

      if (submitError) throw submitError;
      setMessage('Reporte guardado con GPS y evidencia.');
      setDoors(0);
      setPrinted(0);
      setMembers(0);
      setNotes('');
      setPhoto(null);
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : 'No se pudo guardar el reporte.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white px-5 py-8 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center mx-auto mb-5">
            <Camera size={28} />
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tighter">Captura de brigada</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 mt-3">
            Territorio 20X
          </p>
        </div>

        <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 shadow-2xl">
          {!context ? (
            <form onSubmit={verifyChief} className="space-y-4">
              <label className="block">
                <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Teléfono del jefe de brigada</span>
                <input
                  value={phone}
                  onChange={event => setPhone(event.target.value)}
                  placeholder="Teléfono autorizado"
                  className="w-full bg-slate-950 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </label>
              {error && <p className="text-xs font-bold text-red-300 bg-red-950/40 rounded-2xl px-4 py-3">{error}</p>}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-2xl bg-emerald-600 disabled:bg-slate-700 text-white py-4 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                Verificar jefe
              </button>
            </form>
          ) : (
            <>
              <div className="mb-6 rounded-2xl bg-slate-800/70 border border-white/10 p-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Jornada</p>
                <p className="text-lg font-black uppercase mt-1">{context.title}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                  {context.responsible || 'Sin responsable'}
                </p>
              </div>

              <form onSubmit={submitCapture} className="space-y-4">
                <div className="grid grid-cols-1 gap-3">
                  <label>
                    <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Territorio de la jornada</span>
                    <select
                      value={territoryId}
                      onChange={event => setTerritoryId(event.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/40"
                    >
                      <option value="">Seleccionar territorio</option>
                      {(context.territories || []).map(territory => (
                        <option key={territory.id} value={territory.id}>{territory.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Fecha de la jornada</span>
                    <input
                      type="date"
                      value={captureDate}
                      onChange={event => setCaptureDate(event.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                  </label>
                </div>
                <div className="rounded-2xl bg-slate-950 border border-white/10 p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Geolocalizacion</p>
                    <p className="text-xs font-bold text-slate-300 mt-1">{geoStatus}</p>
                  </div>
                  <button
                    type="button"
                    onClick={refreshLocation}
                    className="shrink-0 rounded-xl bg-slate-800 px-3 py-3 text-emerald-300"
                    aria-label="Actualizar GPS"
                  >
                    <MapPin size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <label>
                    <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Puertas tocadas</span>
                    <input type="number" min={0} value={doors} onChange={event => setDoors(Number(event.target.value))} className="w-full bg-slate-950 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/40" />
                  </label>
                  <label>
                    <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Impresos repartidos</span>
                    <input type="number" min={0} value={printed} onChange={event => setPrinted(Number(event.target.value))} className="w-full bg-slate-950 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/40" />
                  </label>
                  <label>
                    <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Brigadistas participantes</span>
                    <input type="number" min={0} value={members} onChange={event => setMembers(Number(event.target.value))} className="w-full bg-slate-950 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/40" />
                  </label>
                </div>
                <label className="block">
                  <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Foto de evidencia</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={event => setPhoto(event.target.files?.[0] || null)}
                    className="block w-full text-xs font-bold text-slate-300 file:mr-4 file:rounded-xl file:border-0 file:bg-emerald-600 file:px-4 file:py-3 file:text-[10px] file:font-black file:uppercase file:tracking-widest file:text-white"
                  />
                </label>
                <input
                  value={notes}
                  onChange={event => setNotes(event.target.value)}
                  placeholder="Notas de campo"
                  className="w-full bg-slate-950 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/40"
                />

                {error && <p className="text-xs font-bold text-red-300 bg-red-950/40 rounded-2xl px-4 py-3">{error}</p>}
                {message && <p className="text-xs font-bold text-emerald-300 bg-emerald-950/40 rounded-2xl px-4 py-3 flex items-center gap-2"><CheckCircle size={16} /> {message}</p>}

                <button type="submit" disabled={isSaving} className="w-full rounded-2xl bg-emerald-600 disabled:bg-slate-700 text-white py-4 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  Guardar reporte
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
