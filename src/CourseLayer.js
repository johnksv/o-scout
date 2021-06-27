import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMap } from "./store";
import GeoJSON from "ol/format/GeoJSON";
import Coordinate from "./models/coordinate";
import useControls from "./services/use-controls";
import useControlConnections from "./services/user-control-connections";
import useSpecialObjects from "./services/use-special-objects";
import courseFeatureStyle from "./course-feature-style";
import useNumberPositions from "./services/use-number-positions";
import { useControlDescriptions } from "./ControlDescriptionLayer";

export default function CourseLayer({ eventName, course, courseAppearance }) {
  const { map, mapFile } = useMap(getMap);

  const source = useMemo(() => new VectorSource(), []);
  const featuresRef = useRef([]);
  const mapScale = useMemo(() => mapFile.getCrs().scale, [mapFile]);
  const objScale = useMemo(
    () =>
      getObjectScale(courseAppearance.scaleSizes, mapScale, course.printScale),
    [courseAppearance, mapScale, course.printScale]
  );
  const layer = useMemo(
    () =>
      new VectorLayer({
        source,
        zIndex: 1,
      }),
    [source]
  );

  const style = useCallback(
    (feature, resolution) =>
      courseFeatureStyle(featuresRef, objScale, feature, resolution),
    [featuresRef, objScale]
  );
  useEffect(() => {
    layer.setStyle(style);
  }, [layer, style]);

  useEffect(() => {
    if (map) {
      map.addLayer(layer);
      return () => {
        map.removeLayer(layer);
      };
    }
  }, [map, layer]);

  const crs = useMemo(() => mapFile.getCrs(), [mapFile]);

  const transformCoord = useCallback((c) => toProjectedCoord(crs, c), [crs]);
  const controlsGeoJSON = useControls(course.controls, transformCoord);
  const controlConnectionsGeoJSON = useControlConnections(
    course.controls,
    transformCoord,
    courseAppearance.autoLegGapSize
  );
  const controlLabelsGeoJSON = useNumberPositions(
    course.controls,
    transformCoord
  );
  const specialObjectsGeoJSON = useSpecialObjects(
    course.specialObjects,
    transformCoord
  );
  useControlDescriptions(map, eventName, course, specialObjectsGeoJSON);

  const features = useMemo(() => {
    const geojson = new GeoJSON();
    return [
      ...geojson.readFeatures(controlsGeoJSON),
      ...geojson.readFeatures(controlConnectionsGeoJSON),
      ...geojson.readFeatures(controlLabelsGeoJSON),
      ...geojson.readFeatures(specialObjectsGeoJSON),
    ];
  }, [
    controlsGeoJSON,
    controlConnectionsGeoJSON,
    controlLabelsGeoJSON,
    specialObjectsGeoJSON,
  ]);
  featuresRef.current = features;

  useEffect(() => {
    source.clear();
    source.addFeatures(features);
  }, [source, features]);

  return null;
}

const mmToMeter = 0.001;
const toProjectedCoord = (crs, coordinate) => {
  return new Coordinate(
    coordinate[0] * mmToMeter * crs.scale + crs.easting,
    coordinate[1] * mmToMeter * crs.scale + crs.northing
  );
};

function getMap({ map, mapFile }) {
  return { map, mapFile };
}

function getObjectScale(scaleSizes, mapScale, printScale) {
  switch (scaleSizes) {
    case "None":
      return printScale / mapScale;
    case "RelativeToMap":
      // Not at all sure about why 0.75 should be there.
      return (mapScale / printScale) * 0.75;
    case "RelativeTo15000":
      return 15000 / mapScale;
    default:
      throw new Error(`Unknown scaleSizes mode "${scaleSizes}".`);
  }
}
