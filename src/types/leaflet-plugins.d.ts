declare module 'leaflet.heat';
declare module 'leaflet.markercluster';
declare module '@changey/react-leaflet-markercluster';

declare namespace L {
  export function heatLayer(
    latlngs: Array<[number, number, number] | [number, number]>,
    options?: any
  ): any;
}
