import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AtSign, Camera, CheckCircle, Facebook, Instagram, Loader2, MapPin, Music2, ShieldCheck, Upload, UserPlus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { isRetryableDpiUploadError, retryDpiUpload, validateDpiFileSignature } from '../utils/dpiUploadSecurity';

interface MobileRegistrationProps {
  token: string;
  mode?: 'standard' | 'massive';
}

interface InviteContext {
  member_id: string;
  full_name: string;
  role: string;
  territory_name?: string | null;
  target_children: number;
  registered_children: number;
  next_role: string;
  is_massive_nuclei?: boolean;
}

interface TerritoryOption {
  id: string;
  name: string;
  type: string;
  parent_id?: string | null;
}

interface AddressMunicipalityOption {
  department: string;
  municipality: string;
  coddep?: number;
  codmun?: number;
  targetNuclei?: number | null;
}

type DpiSide = 'front' | 'back';

interface RegistrationOptionsFile {
  departments?: Array<{
    department?: string;
    coddep?: number;
    municipalities?: Array<{
      municipality?: string;
      codmun?: number;
      target_nuclei?: number | null;
    }>;
  }>;
}

const roleLabel = (role: string) => {
  const labels: Record<string, string> = {
    coordinador_general: 'Coordinador nacional',
    coordinador_departamental: 'Coordinador departamental / Guatemala Metro',
    coordinador_municipal: 'Coordinador municipal / Zona',
    coordinador_zona: 'Coordinador de zona',
    coordinador_nucleo: 'Coordinador NAF21',
    simpatizante: 'Simpatizante'
  };
  return labels[role] || role.split('_').join(' ');
};

const COUNTRY_CODES = [
  { code: '+502', label: 'Guatemala +502' },
  { code: '+52', label: 'Mexico +52' },
  { code: '+1', label: 'Estados Unidos +1' }
];

const NERY_SOCIAL_LINKS = [
  { label: 'Facebook', url: 'https://www.facebook.com/NeryRamosOficial', Icon: Facebook },
  { label: 'Instagram', url: 'https://www.instagram.com/nery.ramos.79/', Icon: Instagram },
  { label: 'TikTok', url: 'https://www.tiktok.com/@neryramosgt', Icon: Music2 },
  { label: 'X', url: 'https://x.com/Nery_RamosR', Icon: AtSign }
];

const GUATEMALA_DEPARTMENTS = [
  'Alta Verapaz',
  'Baja Verapaz',
  'Chimaltenango',
  'Chiquimula',
  'El Progreso',
  'Escuintla',
  'Guatemala',
  'Guatemala (Metro)',
  'Huehuetenango',
  'Izabal',
  'Jalapa',
  'Jutiapa',
  'Peten',
  'Quetzaltenango',
  'Quiche',
  'Retalhuleu',
  'Sacatepequez',
  'San Marcos',
  'Santa Rosa',
  'Solola',
  'Suchitepequez',
  'Totonicapan',
  'Zacapa'
];

const normalizePhone = (value: string) => value.replace(/\D/g, '');
const hasValidPhone = (value: string) => normalizePhone(value).length >= 8;
const AUTO_CAPTURE_REQUIRED_STABLE_FRAMES = 10;
const getDpiCameraStartLabel = (side: DpiSide) => (
  side === 'front'
    ? 'Alinea el frente del DPI dentro del marco'
    : 'Alinea el reverso del DPI y el codigo MRZ dentro del marco'
);

const buildInternationalPhone = (countryCode: string, phone: string) => {
  const digits = normalizePhone(phone);
  if (!digits) return '';
  if (phone.trim().startsWith('+')) return `+${digits}`;

  const countryDigits = normalizePhone(countryCode);
  return digits.startsWith(countryDigits) ? `+${digits}` : `${countryCode}${digits}`;
};

export const MobileRegistration: React.FC<MobileRegistrationProps> = ({ token, mode = 'standard' }) => {
  const isMassiveRegistration = mode === 'massive';
  const [context, setContext] = useState<InviteContext | null>(null);
  const [fullName, setFullName] = useState('');
  const [countryCode, setCountryCode] = useState(COUNTRY_CODES[0].code);
  const [phone, setPhone] = useState('');
  const [dpiFrontPhoto, setDpiFrontPhoto] = useState<File | null>(null);
  const [dpiBackPhoto, setDpiBackPhoto] = useState<File | null>(null);
  const [activeDpiSide, setActiveDpiSide] = useState<DpiSide>('front');
  const [streetName, setStreetName] = useState('');
  const [streetNumber, setStreetNumber] = useState('');
  const [department, setDepartment] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [addressZone, setAddressZone] = useState('');
  const [addressColony, setAddressColony] = useState('');
  const [votedInPastElection, setVotedInPastElection] = useState<'yes' | 'no' | ''>('');
  const [updatedVoterAddress, setUpdatedVoterAddress] = useState<'yes' | 'no' | 'unknown' | ''>('');
  const [pastVotingDepartment, setPastVotingDepartment] = useState('');
  const [pastVotingMunicipality, setPastVotingMunicipality] = useState('');
  const [addressMunicipalityOptions, setAddressMunicipalityOptions] = useState<AddressMunicipalityOption[]>([]);
  const [territoryOptions, setTerritoryOptions] = useState<TerritoryOption[]>([]);
  const [selectedTerritoryId, setSelectedTerritoryId] = useState('');
  const [consent, setConsent] = useState(true);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraQualityLabel, setCameraQualityLabel] = useState('Alinea el DPI dentro del marco');
  const [autoCaptureProgress, setAutoCaptureProgress] = useState(0);
  const [isAutoCapturing, setIsAutoCapturing] = useState(false);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const autoCaptureFramesRef = useRef(0);
  const lastFrameSignatureRef = useRef<number | null>(null);
  const isAutoCapturingRef = useRef(false);

  const dpiFrontPreviewUrl = useMemo(() => {
    if (!dpiFrontPhoto) return null;
    return URL.createObjectURL(dpiFrontPhoto);
  }, [dpiFrontPhoto]);

  const dpiBackPreviewUrl = useMemo(() => {
    if (!dpiBackPhoto) return null;
    return URL.createObjectURL(dpiBackPhoto);
  }, [dpiBackPhoto]);

  const departmentOptions = useMemo(() => {
    const officialDepartments = Array.from(new Set(addressMunicipalityOptions.map(option => option.department)))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'es'));
    return officialDepartments.length > 0 ? officialDepartments : GUATEMALA_DEPARTMENTS;
  }, [addressMunicipalityOptions]);

  const municipalityOptions = useMemo(() => {
    if (!department) return [];
    return addressMunicipalityOptions
      .filter(option => option.department === department)
      .map(option => option.municipality)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'es'));
  }, [addressMunicipalityOptions, department]);

  const pastVotingMunicipalityOptions = useMemo(() => {
    if (!pastVotingDepartment) return [];
    return addressMunicipalityOptions
      .filter(option => option.department === pastVotingDepartment)
      .map(option => option.municipality)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'es'));
  }, [addressMunicipalityOptions, pastVotingDepartment]);

  useEffect(() => {
    let isMounted = true;

    const loadRegistrationOptions = async () => {
      const metasResponse = await fetch('/geo/sice-guatemala-registration-options.json');
      if (metasResponse.ok) {
        const registrationOptions = await metasResponse.json() as RegistrationOptionsFile;
        const metasOptions: AddressMunicipalityOption[] = [];
        (registrationOptions.departments || []).forEach(departmentOption => {
          const departmentName = String(departmentOption.department || '').trim();
          (departmentOption.municipalities || []).forEach(municipalityOption => {
            const municipalityName = String(municipalityOption.municipality || '').trim();
            if (!departmentName || !municipalityName) return;
            metasOptions.push({
              department: departmentName,
              municipality: municipalityName,
              coddep: departmentOption.coddep,
              codmun: municipalityOption.codmun,
              targetNuclei: municipalityOption.target_nuclei ?? null
            });
          });
        });

        if (metasOptions.length > 0) return metasOptions;
      }

      const geoResponse = await fetch('/geo/sice-guatemala-municipalities.geojson');
      if (!geoResponse.ok) return [];
      const geojson = await geoResponse.json() as { features?: Array<{ properties?: Record<string, unknown> }> };
      return (geojson.features || [])
        .map(feature => {
          const properties = feature.properties || {};
          const departmentName = String(properties.geo_department_name || properties.department_name || '').trim();
          const municipalityName = String(properties.geo_municipality_name || properties.municipality_name || '').trim();
          return departmentName && municipalityName
            ? { department: departmentName, municipality: municipalityName }
            : null;
        })
        .filter((option): option is AddressMunicipalityOption => Boolean(option));
    };

    loadRegistrationOptions()
      .then(options => {
        if (!isMounted) return;
        const uniqueOptions = Array.from(
          new Map(options.map(option => [`${option.department}::${option.municipality}`, option])).values()
        );
        setAddressMunicipalityOptions(uniqueOptions);
      })
      .catch(() => {
        if (isMounted) setAddressMunicipalityOptions([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (dpiFrontPreviewUrl) URL.revokeObjectURL(dpiFrontPreviewUrl);
    };
  }, [dpiFrontPreviewUrl]);

  useEffect(() => {
    return () => {
      if (dpiBackPreviewUrl) URL.revokeObjectURL(dpiBackPreviewUrl);
    };
  }, [dpiBackPreviewUrl]);

  const loadContext = async () => {
    setIsLoading(true);
    setError(null);
    const contextResponse = await fetch('/api/create-growth-member-dpi-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: isMassiveRegistration ? 'get_massive_nuclei_invite_context' : 'get_invite_registration_context',
        token,
        origin: window.location.origin
      })
    });
    const contextResult = await contextResponse.json().catch(() => ({}));

    if (!contextResponse.ok || !contextResult.context) {
      setError(contextResult.error || 'Invitacion invalida o expirada.');
      setContext(null);
      setTerritoryOptions([]);
      setSelectedTerritoryId('');
      setIsLoading(false);
      return;
    }

    const inviteContext = contextResult.context as InviteContext;
    const options = (contextResult.territoryOptions || []) as TerritoryOption[];
    setContext(inviteContext);
    setTerritoryOptions(options);
    setSelectedTerritoryId(options.length === 1 ? options[0].id : '');
    setIsLoading(false);
  };

  useEffect(() => {
    loadContext();
  }, [token]);

  const stopCamera = () => {
    cameraStreamRef.current?.getTracks().forEach(track => track.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);
  };

  const closeCamera = () => {
    stopCamera();
    setIsCameraOpen(false);
    setCameraError(null);
    setIsCameraStarting(false);
    setCameraQualityLabel('Alinea el DPI dentro del marco');
    setAutoCaptureProgress(0);
    setIsAutoCapturing(false);
    autoCaptureFramesRef.current = 0;
    lastFrameSignatureRef.current = null;
    isAutoCapturingRef.current = false;
  };

  const startCamera = async () => {
    setCameraError(null);
    setIsCameraStarting(true);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Este navegador no permite vista de cámara en vivo.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      cameraStreamRef.current = stream;
      setCameraStream(stream);
    } catch (cameraStartError) {
      setCameraError(cameraStartError instanceof Error ? cameraStartError.message : 'No se pudo abrir la cámara.');
    } finally {
      setIsCameraStarting(false);
    }
  };

  useEffect(() => {
    if (!isCameraOpen) return;
    void startCamera();

    return () => {
      stopCamera();
    };
  }, [isCameraOpen]);

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  const openGallery = (side: DpiSide = activeDpiSide) => {
    setActiveDpiSide(side);
    galleryInputRef.current?.click();
  };

  const validateDpiImageFile = async (file: File, side: DpiSide) => {
    const canvas = analysisCanvasRef.current || document.createElement('canvas');
    const bitmap = await createImageBitmap(file);
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    const cropWidth = Math.round(sourceWidth * 0.8);
    const cropHeight = Math.round(cropWidth / 1.58);
    const safeCropHeight = Math.min(cropHeight, Math.round(sourceHeight * 0.82));
    const sourceX = Math.max(0, Math.round((sourceWidth - cropWidth) / 2));
    const sourceY = Math.max(0, Math.round((sourceHeight - safeCropHeight) / 2));
    const analysisWidth = 220;
    const analysisHeight = Math.max(110, Math.round(analysisWidth * (safeCropHeight / cropWidth)));

    canvas.width = analysisWidth;
    canvas.height = analysisHeight;
    const context2d = canvas.getContext('2d', { willReadFrequently: true });
    if (!context2d) {
      bitmap.close();
      return { valid: false, message: 'No se pudo revisar la imagen del DPI.' };
    }

    context2d.drawImage(bitmap, sourceX, sourceY, cropWidth, safeCropHeight, 0, 0, analysisWidth, analysisHeight);
    bitmap.close();

    const { data } = context2d.getImageData(0, 0, analysisWidth, analysisHeight);
    const luminance = new Float32Array(analysisWidth * analysisHeight);
    let brightness = 0;
    let contrast = 0;
    let samples = 0;

    for (let y = 0; y < analysisHeight; y += 1) {
      for (let x = 0; x < analysisWidth; x += 1) {
        const offset = (y * analysisWidth + x) * 4;
        const lum = (data[offset] * 0.299) + (data[offset + 1] * 0.587) + (data[offset + 2] * 0.114);
        luminance[y * analysisWidth + x] = lum;
        if (x % 3 === 0 && y % 3 === 0) {
          brightness += lum;
          contrast += Math.abs(lum - 128);
          samples += 1;
        }
      }
    }

    const avgBrightness = brightness / Math.max(1, samples);
    const avgContrast = contrast / Math.max(1, samples);
    const getLum = (x: number, y: number) => luminance[y * analysisWidth + x] || 0;
    const scoreDpiLandmark = (
      x0Ratio: number,
      x1Ratio: number,
      y0Ratio: number,
      y1Ratio: number,
      predicate: (red: number, green: number, blue: number, lum: number) => boolean
    ) => {
      const x0 = Math.max(0, Math.round(analysisWidth * x0Ratio));
      const x1 = Math.min(analysisWidth - 1, Math.round(analysisWidth * x1Ratio));
      const y0 = Math.max(0, Math.round(analysisHeight * y0Ratio));
      const y1 = Math.min(analysisHeight - 1, Math.round(analysisHeight * y1Ratio));
      let hits = 0;
      let inspected = 0;

      for (let y = y0; y <= y1; y += 2) {
        for (let x = x0; x <= x1; x += 2) {
          const offset = (y * analysisWidth + x) * 4;
          const red = data[offset];
          const green = data[offset + 1];
          const blue = data[offset + 2];
          const lum = luminance[y * analysisWidth + x] || 0;
          if (predicate(red, green, blue, lum)) hits += 1;
          inspected += 1;
        }
      }

      return hits / Math.max(1, inspected);
    };
    const scoreTextDensity = (x0Ratio: number, x1Ratio: number, y0Ratio: number, y1Ratio: number) => {
      const x0 = Math.max(1, Math.round(analysisWidth * x0Ratio));
      const x1 = Math.min(analysisWidth - 2, Math.round(analysisWidth * x1Ratio));
      const y0 = Math.max(1, Math.round(analysisHeight * y0Ratio));
      const y1 = Math.min(analysisHeight - 2, Math.round(analysisHeight * y1Ratio));
      let textEdges = 0;
      let inspected = 0;

      for (let y = y0; y <= y1; y += 2) {
        for (let x = x0; x <= x1; x += 2) {
          const horizontal = Math.abs(getLum(x + 1, y) - getLum(x - 1, y));
          const vertical = Math.abs(getLum(x, y + 1) - getLum(x, y - 1));
          const lum = getLum(x, y);
          if (lum < 175 && horizontal + vertical > 24) textEdges += 1;
          inspected += 1;
        }
      }

      return textEdges / Math.max(1, inspected);
    };

    const frontSignals = {
      header: scoreTextDensity(0.06, 0.78, 0.04, 0.22) > 0.08,
      flag: scoreDpiLandmark(
        0.76,
        0.97,
        0.04,
        0.22,
        (red, green, blue, lum) => (blue > 135 && green > 90 && blue > red + 16) || lum > 220
      ) > 0.18,
      chip: scoreDpiLandmark(
        0.06,
        0.33,
        0.2,
        0.6,
        (red, green, blue) => red > 118 && green > 88 && blue < 132 && red >= green
      ) > 0.06,
      portrait: scoreDpiLandmark(
        0.62,
        0.97,
        0.25,
        0.86,
        (red, green, blue, lum) => lum > 42 && lum < 232 && Math.max(red, green, blue) - Math.min(red, green, blue) > 18
      ) > 0.26
    };
    const backSignals = {
      upperData: scoreTextDensity(0.05, 0.95, 0.03, 0.32) > 0.1,
      centralData: scoreTextDensity(0.05, 0.95, 0.25, 0.62) > 0.09,
      mrzBand: scoreTextDensity(0.02, 0.98, 0.62, 0.98) > 0.23
    };
    const frontSignalCount = Object.values(frontSignals).filter(Boolean).length;
    const backSignalCount = Object.values(backSignals).filter(Boolean).length;
    const enoughLight = side === 'front'
      ? avgBrightness > 65 && avgBrightness < 225
      : avgBrightness > 45 && avgBrightness < 245;
    const enoughContrast = side === 'front'
      ? avgContrast > 24
      : avgContrast > 16;
    const hasExpectedSideSignals = side === 'front'
      ? frontSignals.chip && frontSignalCount >= 3
      : backSignalCount >= 1 || frontSignalCount >= 2;

    return {
      valid: enoughLight && enoughContrast && hasExpectedSideSignals,
      message: enoughLight && enoughContrast
        ? side === 'front'
          ? `La imagen no parece ser el frente del DPI. Senales detectadas ${frontSignalCount}/4.`
          : `La imagen no parece ser el reverso del DPI. Asegura que se vean los datos del reverso o el codigo inferior MRZ. Senales detectadas ${backSignalCount}/3.`
        : 'La imagen del DPI necesita mejor luz y nitidez.'
    };
  };

  const acceptDpiPhoto = async (file: File, side: DpiSide, source: 'camera' | 'gallery', auto = false) => {
    try {
      const fileSecurity = await validateDpiFileSignature(file);
      if (!fileSecurity.valid) {
        if (side === 'front') setDpiFrontPhoto(null);
        else setDpiBackPhoto(null);
        if (source === 'camera') setCameraError(fileSecurity.message || 'No se pudo validar el archivo del DPI.');
        setError(fileSecurity.message || 'No se pudo validar el archivo del DPI.');
        return false;
      }

      const validation = await validateDpiImageFile(file, side);
      if (!validation.valid) {
        if (side === 'front') setDpiFrontPhoto(null);
        else setDpiBackPhoto(null);
        if (source === 'camera') setCameraError(validation.message);
        setError(validation.message);
        return false;
      }

      if (side === 'front') setDpiFrontPhoto(file);
      else setDpiBackPhoto(file);
      setError(null);
      if (auto) {
        setMessage('Imagen del DPI capturada automáticamente por calidad suficiente.');
      }
      return true;
    } catch {
      if (side === 'front') setDpiFrontPhoto(null);
      else setDpiBackPhoto(null);
      setError('No se pudo revisar la imagen del DPI.');
      return false;
    }
  };

  const handleGalleryFile = async (file?: File | null) => {
    if (!file) return;
    const accepted = await acceptDpiPhoto(file, activeDpiSide, 'gallery');
    if (accepted) closeCamera();
  };

  const captureDpiPhoto = async (auto = false) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      setCameraError('La cámara aún no está lista.');
      return;
    }

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context2d = canvas.getContext('2d');
    if (!context2d) {
      setCameraError('No se pudo preparar la captura.');
      return;
    }

    context2d.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/jpeg', 0.9);
    });

    if (!blob) {
      setCameraError('No se pudo generar la imagen del DPI.');
      return;
    }

    const accepted = await acceptDpiPhoto(
      new File([blob], `dpi-${activeDpiSide}-${Date.now()}.jpg`, { type: 'image/jpeg' }),
      activeDpiSide,
      'camera',
      auto
    );
    if (accepted) closeCamera();
  };

  const evaluateDpiFrameQuality = () => {
    const video = videoRef.current;
    const canvas = analysisCanvasRef.current;
    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    const cropWidth = Math.round(sourceWidth * 0.64);
    const cropHeight = Math.round(cropWidth / 1.58);
    const safeCropHeight = Math.min(cropHeight, Math.round(sourceHeight * 0.7));
    const sourceX = Math.round((sourceWidth - cropWidth) / 2);
    const sourceY = Math.round((sourceHeight - safeCropHeight) / 2);
    const analysisWidth = 180;
    const analysisHeight = Math.max(90, Math.round(analysisWidth * (safeCropHeight / cropWidth)));

    canvas.width = analysisWidth;
    canvas.height = analysisHeight;
    const context2d = canvas.getContext('2d', { willReadFrequently: true });
    if (!context2d) return;

    context2d.drawImage(video, sourceX, sourceY, cropWidth, safeCropHeight, 0, 0, analysisWidth, analysisHeight);
    const { data } = context2d.getImageData(0, 0, analysisWidth, analysisHeight);
    let brightness = 0;
    let edgeEnergy = 0;
    let contrast = 0;
    let signature = 0;
    let samples = 0;
    let previousLum = 0;
    const luminance = new Float32Array(analysisWidth * analysisHeight);

    for (let y = 0; y < analysisHeight; y += 1) {
      for (let x = 0; x < analysisWidth; x += 1) {
        const offset = (y * analysisWidth + x) * 4;
        const lum = (data[offset] * 0.299) + (data[offset + 1] * 0.587) + (data[offset + 2] * 0.114);
        luminance[y * analysisWidth + x] = lum;
        if (x % 3 === 0 && y % 3 === 0) {
          brightness += lum;
          contrast += Math.abs(lum - 128);
          if (samples > 0) edgeEnergy += Math.abs(lum - previousLum);
          if (x % 18 === 0 && y % 18 === 0) signature += lum;
          previousLum = lum;
          samples += 1;
        }
      }
    }

    const avgBrightness = brightness / Math.max(1, samples);
    const avgContrast = contrast / Math.max(1, samples);
    const avgEdges = edgeEnergy / Math.max(1, samples);
    const getLum = (x: number, y: number) => luminance[y * analysisWidth + x] || 0;
    const cornerZones = [
      { x0: 0, x1: Math.round(analysisWidth * 0.32), y0: 0, y1: Math.round(analysisHeight * 0.32) },
      { x0: Math.round(analysisWidth * 0.68), x1: analysisWidth - 1, y0: 0, y1: Math.round(analysisHeight * 0.32) },
      { x0: 0, x1: Math.round(analysisWidth * 0.32), y0: Math.round(analysisHeight * 0.68), y1: analysisHeight - 1 },
      { x0: Math.round(analysisWidth * 0.68), x1: analysisWidth - 1, y0: Math.round(analysisHeight * 0.68), y1: analysisHeight - 1 }
    ];

    const cornerScores = cornerZones.map(zone => {
      let strongEdges = 0;
      let edgeSum = 0;
      let zoneSamples = 0;

      for (let y = zone.y0 + 1; y < zone.y1 - 1; y += 2) {
        for (let x = zone.x0 + 1; x < zone.x1 - 1; x += 2) {
          const horizontal = Math.abs(getLum(x + 1, y) - getLum(x - 1, y));
          const vertical = Math.abs(getLum(x, y + 1) - getLum(x, y - 1));
          const gradient = horizontal + vertical;
          edgeSum += gradient;
          if (gradient > 38) strongEdges += 1;
          zoneSamples += 1;
        }
      }

      const ratio = strongEdges / Math.max(1, zoneSamples);
      const average = edgeSum / Math.max(1, zoneSamples);
      return ratio * 100 + average;
    });
    const visibleCornerCount = cornerScores.filter(score => score > 14).length;
    const hasFourDocumentCorners = visibleCornerCount === 4;
    const sideZones = {
      superior: { x0: Math.round(analysisWidth * 0.18), x1: Math.round(analysisWidth * 0.82), y0: 0, y1: Math.round(analysisHeight * 0.18) },
      inferior: { x0: Math.round(analysisWidth * 0.18), x1: Math.round(analysisWidth * 0.82), y0: Math.round(analysisHeight * 0.82), y1: analysisHeight - 1 },
      izquierda: { x0: 0, x1: Math.round(analysisWidth * 0.18), y0: Math.round(analysisHeight * 0.18), y1: Math.round(analysisHeight * 0.82) },
      derecha: { x0: Math.round(analysisWidth * 0.82), x1: analysisWidth - 1, y0: Math.round(analysisHeight * 0.18), y1: Math.round(analysisHeight * 0.82) }
    };

    const scoreHorizontalSide = (zone: typeof sideZones.superior) => {
      const columns = Math.max(1, zone.x1 - zone.x0);
      let coveredColumns = 0;

      for (let x = zone.x0; x < zone.x1; x += 2) {
        let columnHasEdge = false;
        for (let y = zone.y0 + 1; y < zone.y1 - 1; y += 2) {
          const vertical = Math.abs(getLum(x, y + 1) - getLum(x, y - 1));
          if (vertical > 22) {
            columnHasEdge = true;
            break;
          }
        }
        if (columnHasEdge) coveredColumns += 2;
      }

      return coveredColumns / columns;
    };

    const scoreVerticalSide = (zone: typeof sideZones.izquierda) => {
      const rows = Math.max(1, zone.y1 - zone.y0);
      let coveredRows = 0;

      for (let y = zone.y0; y < zone.y1; y += 2) {
        let rowHasEdge = false;
        for (let x = zone.x0 + 1; x < zone.x1 - 1; x += 2) {
          const horizontal = Math.abs(getLum(x + 1, y) - getLum(x - 1, y));
          if (horizontal > 22) {
            rowHasEdge = true;
            break;
          }
        }
        if (rowHasEdge) coveredRows += 2;
      }

      return coveredRows / rows;
    };

    const sideCoverage = {
      superior: scoreHorizontalSide(sideZones.superior),
      inferior: scoreHorizontalSide(sideZones.inferior),
      izquierda: scoreVerticalSide(sideZones.izquierda),
      derecha: scoreVerticalSide(sideZones.derecha)
    };
    const visibleSideCount = Object.values(sideCoverage).filter(score => score >= 0.2).length;
    const hasFourDocumentSides = visibleSideCount === 4;

    const scoreDpiLandmark = (
      x0Ratio: number,
      x1Ratio: number,
      y0Ratio: number,
      y1Ratio: number,
      predicate: (red: number, green: number, blue: number, lum: number) => boolean
    ) => {
      const x0 = Math.max(0, Math.round(analysisWidth * x0Ratio));
      const x1 = Math.min(analysisWidth - 1, Math.round(analysisWidth * x1Ratio));
      const y0 = Math.max(0, Math.round(analysisHeight * y0Ratio));
      const y1 = Math.min(analysisHeight - 1, Math.round(analysisHeight * y1Ratio));
      let hits = 0;
      let inspected = 0;

      for (let y = y0; y <= y1; y += 2) {
        for (let x = x0; x <= x1; x += 2) {
          const offset = (y * analysisWidth + x) * 4;
          const red = data[offset];
          const green = data[offset + 1];
          const blue = data[offset + 2];
          const lum = luminance[y * analysisWidth + x] || 0;
          if (predicate(red, green, blue, lum)) hits += 1;
          inspected += 1;
        }
      }

      return hits / Math.max(1, inspected);
    };

    const scoreTextDensity = (x0Ratio: number, x1Ratio: number, y0Ratio: number, y1Ratio: number) => {
      const x0 = Math.max(1, Math.round(analysisWidth * x0Ratio));
      const x1 = Math.min(analysisWidth - 2, Math.round(analysisWidth * x1Ratio));
      const y0 = Math.max(1, Math.round(analysisHeight * y0Ratio));
      const y1 = Math.min(analysisHeight - 2, Math.round(analysisHeight * y1Ratio));
      let textEdges = 0;
      let inspected = 0;

      for (let y = y0; y <= y1; y += 2) {
        for (let x = x0; x <= x1; x += 2) {
          const horizontal = Math.abs(getLum(x + 1, y) - getLum(x - 1, y));
          const vertical = Math.abs(getLum(x, y + 1) - getLum(x, y - 1));
          const lum = getLum(x, y);
          if (lum < 170 && horizontal + vertical > 26) textEdges += 1;
          inspected += 1;
        }
      }

      return textEdges / Math.max(1, inspected);
    };

    const dpiLandmarks = activeDpiSide === 'front'
      ? {
          header: scoreTextDensity(0.06, 0.76, 0.04, 0.2) > 0.1,
          flag: scoreDpiLandmark(
            0.78,
            0.96,
            0.04,
            0.2,
            (red, green, blue, lum) => (blue > 135 && green > 95 && blue > red + 18) || lum > 218
          ) > 0.2,
          chip: scoreDpiLandmark(
            0.08,
            0.31,
            0.25,
            0.56,
            (red, green, blue) => red > 120 && green > 92 && blue < 125 && red >= green
          ) > 0.08,
          portrait: scoreDpiLandmark(
            0.64,
            0.96,
            0.28,
            0.82,
            (red, green, blue, lum) => lum > 45 && lum < 230 && Math.max(red, green, blue) - Math.min(red, green, blue) > 18
          ) > 0.32
        }
      : {
          upperData: scoreTextDensity(0.05, 0.95, 0.03, 0.32) > 0.1,
          centralData: scoreTextDensity(0.05, 0.95, 0.25, 0.62) > 0.08,
          mrzBand: scoreTextDensity(0.02, 0.98, 0.62, 0.98) > 0.17
    };
    const dpiLandmarkCount = Object.values(dpiLandmarks).filter(Boolean).length;
    const hasFrontChip = activeDpiSide === 'front' && 'chip' in dpiLandmarks && Boolean(dpiLandmarks.chip);
    const hasDpiLandmarks = activeDpiSide === 'front'
      ? hasFrontChip && dpiLandmarkCount >= 3
      : dpiLandmarkCount >= 1;
    const normalizedSignature = signature / Math.max(1, Math.floor(analysisWidth / 18) * Math.floor(analysisHeight / 18));
    const lastSignature = lastFrameSignatureRef.current;
    const stable = lastSignature !== null && Math.abs(normalizedSignature - lastSignature) < 5.5;
    lastFrameSignatureRef.current = normalizedSignature;

    const hasEnoughLight = activeDpiSide === 'front'
      ? avgBrightness > 70 && avgBrightness < 220
      : avgBrightness > 45 && avgBrightness < 245;
    const hasEnoughDetail = activeDpiSide === 'front'
      ? avgEdges > 8.5 && avgContrast > 30
      : avgEdges > 5.5 && avgContrast > 18;
    const hasDocumentFrame = activeDpiSide === 'front'
      ? hasFourDocumentCorners && hasFourDocumentSides
      : visibleCornerCount >= 2 && visibleSideCount >= 2;
    const frameIsGood = hasEnoughLight && hasEnoughDetail && hasDocumentFrame && hasDpiLandmarks && stable;

    if (!hasEnoughLight) {
      setCameraQualityLabel(avgBrightness <= 70 ? 'Acerca el DPI a más luz' : 'Reduce reflejos sobre el DPI');
    } else if (activeDpiSide === 'front' && !hasFourDocumentCorners) {
      setCameraQualityLabel(`Faltan bordes del DPI (${visibleCornerCount}/4)`);
    } else if (activeDpiSide === 'front' && !hasFourDocumentSides) {
      setCameraQualityLabel(`Ajusta el encuadre: lados visibles ${visibleSideCount}/4`);
    } else if (activeDpiSide === 'back' && !hasDocumentFrame) {
      setCameraQualityLabel(`Ajusta el reverso dentro del marco (${visibleCornerCount}/4 bordes)`);
    } else if (!hasDpiLandmarks) {
      setCameraQualityLabel(activeDpiSide === 'front'
        ? `Busca chip, bandera, texto y foto del DPI (${dpiLandmarkCount}/4)`
        : `Busca codigo MRZ inferior y datos del reverso (${dpiLandmarkCount}/3)`);
    } else if (!hasEnoughDetail) {
      setCameraQualityLabel('Acerca el DPI y evita movimiento');
    } else if (!stable) {
      setCameraQualityLabel('Mantén el DPI quieto dentro del marco');
    } else {
      setCameraQualityLabel('Calidad suficiente. Capturando...');
    }

    autoCaptureFramesRef.current = frameIsGood
      ? Math.min(AUTO_CAPTURE_REQUIRED_STABLE_FRAMES, autoCaptureFramesRef.current + 1)
      : 0;

    setAutoCaptureProgress(Math.round((autoCaptureFramesRef.current / AUTO_CAPTURE_REQUIRED_STABLE_FRAMES) * 100));

    if (
      autoCaptureFramesRef.current >= AUTO_CAPTURE_REQUIRED_STABLE_FRAMES
      && !isAutoCapturingRef.current
    ) {
      isAutoCapturingRef.current = true;
      setIsAutoCapturing(true);
      void captureDpiPhoto(true);
    }
  };

  useEffect(() => {
    if (!isCameraOpen || !cameraStream) return;

    const intervalId = window.setInterval(evaluateDpiFrameQuality, 220);
    return () => window.clearInterval(intervalId);
  }, [isCameraOpen, cameraStream, activeDpiSide]);

  const uploadDpiPhoto = async (file: File, side: DpiSide) => {
    if (!file) {
      throw new Error(`Captura la imagen ${side === 'front' ? 'frontal' : 'posterior'} del DPI.`);
    }

    const fileSecurity = await validateDpiFileSignature(file);
    if (!fileSecurity.valid) {
      throw new Error(fileSecurity.message || 'No se pudo validar el archivo del DPI.');
    }

    const response = await fetch('/api/create-growth-member-dpi-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        fileName: file.name,
        contentType: fileSecurity.mimeType || file.type || 'image/jpeg',
        fileSize: file.size,
        origin: window.location.origin
      })
    });

    const uploadRequest = await response.json();
    if (!response.ok || !uploadRequest.path || (!uploadRequest.uploadToken && !uploadRequest.directUpload)) {
      throw new Error(uploadRequest.error || 'No se pudo preparar la carga segura del DPI.');
    }

    const bucket = uploadRequest.bucket || 'growth-member-dpi';
    const { error: uploadError } = await retryDpiUpload(async () => {
      const uploadResult = uploadRequest.directUpload
        ? await supabase.storage
          .from(bucket)
          .upload(uploadRequest.path, file, {
            contentType: fileSecurity.mimeType || file.type || 'image/jpeg',
            upsert: false
          })
        : await supabase.storage
          .from(bucket)
          .uploadToSignedUrl(uploadRequest.path, uploadRequest.uploadToken, file, {
            contentType: fileSecurity.mimeType || file.type || 'image/jpeg',
            upsert: false
          });

      if (uploadResult.error && isRetryableDpiUploadError(uploadResult.error)) {
        throw uploadResult.error;
      }

      return uploadResult;
    });
    if (uploadError) throw uploadError;

    return uploadRequest.path as string;
  };

  const validateForm = () => {
    if (!fullName.trim()) return 'Captura el nombre completo.';
    if (!dpiFrontPhoto) return 'Captura el frente del DPI.';
    if (!dpiBackPhoto) return 'Captura el reverso del DPI.';
    if (!department) return 'Selecciona el departamento.';
    if (!municipality) return 'Selecciona el municipio.';
    if (!streetName.trim()) return 'Captura calle o avenida.';
    if (!streetNumber.trim()) return 'Captura número.';
    if (!addressZone.trim()) return 'Captura zona.';
    if (!addressColony.trim()) return 'Captura colonia o cantón.';
    if (!votedInPastElection) return 'Indica si votó en las elecciones pasadas.';
    if (votedInPastElection === 'yes' && !pastVotingDepartment) return 'Selecciona el departamento donde votó en las elecciones pasadas.';
    if (votedInPastElection === 'yes' && !pastVotingMunicipality) return 'Selecciona el municipio donde votó en las elecciones pasadas.';
    if (votedInPastElection === 'yes' && !updatedVoterAddress) return 'Indica si actualizó su domicilio de empadronamiento.';
    if (!hasValidPhone(phone)) return 'Captura un teléfono valido. Lo usarás para entrar al dashboard de tu nivel.';
    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    let dpiFrontStoragePath = '';
    let dpiBackStoragePath = '';
    try {
      dpiFrontStoragePath = await uploadDpiPhoto(dpiFrontPhoto as File, 'front');
      dpiBackStoragePath = await uploadDpiPhoto(dpiBackPhoto as File, 'back');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'No se pudo cargar la imagen del DPI.');
      setIsSaving(false);
      return;
    }

    const formattedPhone = buildInternationalPhone(countryCode, phone);
    const registrationPayload = {
        dpi_storage_bucket: 'growth-member-dpi',
        dpi_storage_path: dpiFrontStoragePath,
        dpi_storage_path_front: dpiFrontStoragePath,
        dpi_storage_path_back: dpiBackStoragePath,
        dpi_documents: {
          front: {
            bucket: 'growth-member-dpi',
            path: dpiFrontStoragePath
          },
          back: {
            bucket: 'growth-member-dpi',
            path: dpiBackStoragePath
          }
        },
        address: {
          department,
          municipality: municipality.trim(),
          street_or_avenue: streetName.trim(),
          street_number: streetNumber.trim(),
          number: streetNumber.trim(),
          zone: addressZone.trim(),
          colony: addressColony.trim(),
          canton: addressColony.trim(),
          line1: `${streetName.trim()} ${streetNumber.trim()}`.trim()
        },
        past_voting_place: {
          voted: votedInPastElection === 'yes',
          department: votedInPastElection === 'yes' ? pastVotingDepartment : null,
          municipality: votedInPastElection === 'yes' ? pastVotingMunicipality : null,
          updated_voter_address: votedInPastElection === 'yes' ? updatedVoterAddress : null
        },
        capture_requirements: {
          dpi_photo_required: true,
          dpi_front_required: true,
          dpi_back_required: true,
          address_required: true,
          department_required: true,
          municipality_required: true,
          past_voting_place_required: votedInPastElection === 'yes',
          past_vote_question_required: true
        },
        captured_from: isMassiveRegistration ? 'mobile_massive_nuclei_registration' : 'mobile_link_registration'
      };

    const saveResponse = await fetch('/api/create-growth-member-dpi-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: isMassiveRegistration ? 'register_massive_nuclei_by_invite' : 'register_member_by_invite',
        token,
        fullName: fullName.trim(),
        phone: formattedPhone,
        territoryId: selectedTerritoryId || null,
        consentContact: consent,
        payload: registrationPayload,
        origin: window.location.origin
      })
    });
    const saveResult = await saveResponse.json().catch(() => ({}));

    if (!saveResponse.ok) {
      setError(saveResult.error || 'No se pudo guardar el registro.');
      setIsSaving(false);
      return;
    }

    setFullName('');
    setPhone('');
    setDpiFrontPhoto(null);
    setDpiBackPhoto(null);
    setStreetName('');
    setStreetNumber('');
    setDepartment('');
    setMunicipality('');
    setAddressZone('');
    setAddressColony('');
    setVotedInPastElection('');
    setUpdatedVoterAddress('');
    setPastVotingDepartment('');
    setPastVotingMunicipality('');
    setSelectedTerritoryId(territoryOptions.length === 1 ? territoryOptions[0].id : '');
    setConsent(true);
    setMessage('Registro guardado. Ahora entra al enlace de acceso de tu nivel con tu nombre, teléfono y contraseña.');
    if (isMassiveRegistration) {
      setMessage('Registro recibido. Quedaste registrado como Coordinador Sectorial para validación.');
    }
    await loadContext();
    setIsSaving(false);
  };

  const renderDpiCaptureButton = (side: DpiSide, title: string, previewUrl: string | null, photo: File | null) => (
    <button
      type="button"
      onClick={() => {
        setActiveDpiSide(side);
        setCameraQualityLabel(getDpiCameraStartLabel(side));
        setIsCameraOpen(true);
      }}
      className="w-full rounded-[28px] border border-white/10 bg-slate-950 p-3 text-left"
    >
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900 min-h-[170px] flex items-center justify-center">
        {previewUrl ? (
          <img src={previewUrl} alt={`Vista previa ${title.toLowerCase()} del DPI`} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="text-center px-6">
            <Camera className="mx-auto mb-4 text-emerald-300" size={30} />
            <p className="text-xs font-black uppercase tracking-widest text-white">{title}</p>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-300">
        <Upload size={14} />
        {photo ? 'Cambiar imagen' : 'Abrir cámara o galería'}
      </div>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white px-5 py-8 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center mx-auto mb-5">
            <UserPlus size={28} />
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tighter">
            {isMassiveRegistration ? 'Registro masivo' : 'Registro territorial'}
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 mt-3">
            {isMassiveRegistration ? 'Registros sectoriales NAF21' : 'Núcleos de Acciones Firmes (NAF21)'}
          </p>
        </div>

        <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 shadow-2xl">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="animate-spin mb-4" />
            <p className="text-[10px] font-black uppercase tracking-widest">Validando invitación</p>
            </div>
          ) : error && !context ? (
            <div className="py-12 text-center">
              <p className="text-sm font-black text-red-300 uppercase tracking-widest">{error}</p>
            </div>
          ) : context ? (
            <>
              <div className="mb-6 rounded-2xl bg-slate-800/70 border border-white/10 p-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Responsable</p>
                <p className="text-lg font-black uppercase mt-1">{context.full_name}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                  {roleLabel(context.role)} - {context.territory_name || 'Sin territorio'}
                </p>
                {!isMassiveRegistration && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Avance</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
                      {context.registered_children}/{context.target_children}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                    <div
                      className="h-full bg-emerald-400"
                      style={{ width: `${Math.min(100, Math.round((context.registered_children / Math.max(1, context.target_children)) * 100))}%` }}
                    />
                  </div>
                </div>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">
                    Registrar como {isMassiveRegistration ? 'Coordinador Sectorial' : roleLabel(context.next_role)}
                  </label>
                  <input
                    value={fullName}
                    onChange={event => setFullName(event.target.value)}
                    placeholder="Nombre completo"
                    required
                    className="w-full bg-slate-950 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>

                {territoryOptions.length > 0 && (
                  <div className="rounded-3xl bg-slate-950 border border-emerald-500/20 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <MapPin size={16} className="text-emerald-300" />
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Territorio operativo asignado</p>
                    </div>
                    <select
                      value={selectedTerritoryId}
                      onChange={event => setSelectedTerritoryId(event.target.value)}
                      disabled={territoryOptions.length === 1}
                      className="w-full bg-slate-900 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/40"
                    >
                      <option value="">
                        {context.territory_name ? `Heredar: ${context.territory_name}` : 'Sin asignar por ahora'}
                      </option>
                      {territoryOptions.map(option => (
                        <option key={option.id} value={option.id}>
                          {option.name} - {option.type}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] font-bold leading-relaxed text-slate-400">
                      Si no eliges otra opcion, tributara al territorio operativo del responsable. El domicilio actual y el lugar donde voto pueden ser distintos.
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">
                    Identificación DPI
                  </label>
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={event => handleGalleryFile(event.target.files?.[0] || null)}
                    className="sr-only"
                  />
                  {renderDpiCaptureButton('front', 'Frente del DPI', dpiFrontPreviewUrl, dpiFrontPhoto)}
                  {renderDpiCaptureButton('back', 'Reverso del DPI', dpiBackPreviewUrl, dpiBackPhoto)}
                </div>

                <div className="rounded-3xl bg-slate-950 border border-white/10 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-emerald-300" />
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Domicilio actual</p>
                  </div>
                  <select
                    value={department}
                    onChange={event => {
                      setDepartment(event.target.value);
                      setMunicipality('');
                    }}
                    required
                    className="w-full bg-slate-900 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/40"
                  >
                    <option value="">Departamento</option>
                    {departmentOptions.map(item => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                  <select
                    value={municipality}
                    onChange={event => setMunicipality(event.target.value)}
                    required
                    className="w-full bg-slate-900 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/40"
                  >
                    <option value="">{department ? 'Municipio' : 'Selecciona departamento primero'}</option>
                    {municipalityOptions.map(item => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                  <input
                    value={streetName}
                    onChange={event => setStreetName(event.target.value)}
                    placeholder="Calle o avenida"
                    required
                    className="w-full bg-slate-900 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                  <input
                    value={streetNumber}
                    onChange={event => setStreetNumber(event.target.value)}
                    placeholder="Número"
                    required
                    className="w-full bg-slate-900 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                  <input
                    value={addressZone}
                    onChange={event => setAddressZone(event.target.value)}
                    placeholder="Zona"
                    required
                    className="w-full bg-slate-900 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                  <input
                    value={addressColony}
                    onChange={event => setAddressColony(event.target.value)}
                    placeholder="Colonia o cantón"
                    required
                    className="w-full bg-slate-900 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>

                <div className="rounded-3xl bg-slate-950 border border-white/10 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-emerald-300" />
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">¿Votó en las elecciones pasadas?</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }].map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setVotedInPastElection(option.value as 'yes' | 'no');
                          if (option.value === 'no') {
                            setPastVotingDepartment('');
                            setPastVotingMunicipality('');
                            setUpdatedVoterAddress('');
                          }
                        }}
                        className={`rounded-2xl border px-4 py-4 text-[10px] font-black uppercase tracking-widest transition-colors ${votedInPastElection === option.value ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200' : 'border-white/10 bg-slate-900 text-slate-300'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  {votedInPastElection === 'yes' && (
                    <>
                      <select
                        value={pastVotingDepartment}
                        onChange={event => {
                          setPastVotingDepartment(event.target.value);
                          setPastVotingMunicipality('');
                        }}
                        required
                        className="w-full bg-slate-900 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/40"
                      >
                        <option value="">Departamento donde votó</option>
                        {departmentOptions.map(item => (
                          <option key={item} value={item}>{item}</option>
                        ))}
                      </select>
                      <select
                        value={pastVotingMunicipality}
                        onChange={event => setPastVotingMunicipality(event.target.value)}
                        required
                        className="w-full bg-slate-900 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/40"
                      >
                        <option value="">{pastVotingDepartment ? 'Municipio donde votó' : 'Selecciona departamento primero'}</option>
                        {pastVotingMunicipalityOptions.map(item => (
                          <option key={item} value={item}>{item}</option>
                        ))}
                      </select>
                      <select
                        value={updatedVoterAddress}
                        onChange={event => setUpdatedVoterAddress(event.target.value as 'yes' | 'no' | 'unknown')}
                        required
                        className="w-full bg-slate-900 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/40"
                      >
                        <option value="">¿Actualizó su domicilio de empadronamiento?</option>
                        <option value="yes">Sí, ya lo actualizó</option>
                        <option value="no">No, sigue empadronado en otro lugar</option>
                        <option value="unknown">No sabe / no recuerda</option>
                      </select>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[190px_minmax(0,1fr)] gap-3">
                  <select
                    value={countryCode}
                    onChange={event => setCountryCode(event.target.value)}
                    className="bg-slate-950 border border-white/10 rounded-2xl px-3 py-4 text-xs font-black uppercase outline-none focus:ring-2 focus:ring-emerald-500/40"
                  >
                    {COUNTRY_CODES.map(country => (
                      <option key={country.code} value={country.code}>{country.label}</option>
                    ))}
                  </select>
                  <input
                    value={phone}
                    onChange={event => setPhone(event.target.value)}
                    placeholder="Teléfono registrado para acceso"
                    required
                    inputMode="tel"
                    className="w-full bg-slate-950 border border-white/10 rounded-2xl px-4 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
                <label className="flex items-start gap-3 rounded-2xl bg-slate-950 border border-white/10 p-4">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={event => setConsent(event.target.checked)}
                    className="mt-1"
                  />
                  <span className="text-xs font-bold text-slate-300 leading-relaxed">
                    La persona acepta ser contactada para seguimiento territorial.
                  </span>
                </label>

                {error && <p className="text-xs font-bold text-red-300 bg-red-950/40 rounded-2xl px-4 py-3">{error}</p>}
                {message && (
                  <p className="text-xs font-bold text-emerald-300 bg-emerald-950/40 rounded-2xl px-4 py-3 flex items-center gap-2">
                    <CheckCircle size={16} /> {message}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSaving || (!isMassiveRegistration && context.registered_children >= context.target_children)}
                  className="w-full rounded-2xl bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-400 text-white py-4 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  Guardar registro
                </button>

                <div className="rounded-3xl bg-slate-950 border border-white/10 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">
                    Redes sociales de Nery Ramos
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {NERY_SOCIAL_LINKS.map(({ label, url, Icon }) => (
                      <a
                        key={label}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 border border-white/10 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-100 hover:bg-emerald-500/20 hover:border-emerald-400/40 hover:text-emerald-100 transition-colors"
                        aria-label={`Abrir ${label} de Nery Ramos`}
                      >
                        <Icon size={15} />
                        {label}
                      </a>
                    ))}
                  </div>
                </div>
              </form>
            </>
          ) : null}
        </div>
      </div>

      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.24em] text-emerald-300">Imagen del DPI</p>
              <h2 className="text-lg font-black uppercase tracking-tight">
                {activeDpiSide === 'front' ? 'Tomar frente del DPI' : 'Tomar reverso del DPI'}
              </h2>
            </div>
            <button
              type="button"
              onClick={closeCamera}
              className="h-11 w-11 rounded-2xl bg-white/10 flex items-center justify-center text-slate-200"
              aria-label="Cerrar cámara"
            >
              <X size={20} />
            </button>
          </div>

          <div className="relative flex-1 min-h-0 bg-black">
            {cameraStream ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 px-8 text-center">
                <Loader2 className={`mb-4 ${isCameraStarting ? 'animate-spin' : ''}`} />
                <p className="text-xs font-black uppercase tracking-widest">
                  {isCameraStarting ? 'Abriendo cámara' : 'Cámara no disponible'}
                </p>
                {cameraError && <p className="mt-3 text-xs font-bold text-red-200">{cameraError}</p>}
              </div>
            )}

            {cameraStream && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-8">
                <div className="relative w-full max-w-sm aspect-[1.58/1] rounded-2xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(2,6,23,0.42)]">
                  <div className="absolute -left-0.5 -top-0.5 h-10 w-10 border-l-4 border-t-4 border-emerald-300 rounded-tl-xl" />
                  <div className="absolute -right-0.5 -top-0.5 h-10 w-10 border-r-4 border-t-4 border-emerald-300 rounded-tr-xl" />
                  <div className="absolute -bottom-0.5 -left-0.5 h-10 w-10 border-b-4 border-l-4 border-emerald-300 rounded-bl-xl" />
                  <div className="absolute -bottom-0.5 -right-0.5 h-10 w-10 border-b-4 border-r-4 border-emerald-300 rounded-br-xl" />
                  <div className="absolute left-1/2 top-full mt-5 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-950/85 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white">
                    Centra el plastico dentro del marco
                  </div>
                </div>
              </div>
            )}

            {cameraStream && (
              <div className="absolute left-5 right-5 top-5 z-20 rounded-2xl bg-slate-950/80 border border-white/10 px-4 py-3 backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white">{cameraQualityLabel}</p>
                  <span className="text-[10px] font-black text-emerald-300">{autoCaptureProgress}%</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white/15 overflow-hidden">
                  <div className="h-full bg-emerald-400 transition-all" style={{ width: `${autoCaptureProgress}%` }} />
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-white/10 bg-slate-950 px-5 py-4 space-y-3">
            {cameraError && cameraStream && (
              <p className="rounded-2xl bg-red-950/40 px-4 py-3 text-xs font-bold text-red-200">{cameraError}</p>
            )}
            <button
              type="button"
              onClick={() => captureDpiPhoto(false)}
              disabled={!cameraStream || isAutoCapturing}
              className="w-full rounded-2xl bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-white py-4 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <Camera size={16} />
              {isAutoCapturing ? 'Capturando automáticamente' : 'Capturar manualmente'}
            </button>
            <button
              type="button"
              onClick={() => openGallery(activeDpiSide)}
              className="w-full rounded-2xl bg-white/10 text-slate-200 py-4 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <Upload size={16} />
              Usar galería
            </button>
          </div>
          <canvas ref={canvasRef} className="hidden" />
          <canvas ref={analysisCanvasRef} className="hidden" />
        </div>
      )}
    </div>
  );
};

