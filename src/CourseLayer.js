import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMap } from "./store";
import GeoJSON from "ol/format/GeoJSON";
import useControls from "./services/use-controls";
import useControlConnections from "./services/user-control-connections";
import useSpecialObjects from "./services/use-special-objects";
import courseFeatureStyle from "./course-feature-style";
import useNumberPositions from "./services/use-number-positions";
import { useControlDescriptions } from "./ControlDescriptionLayer";
import Projection from "ol/proj/Projection";
import Units from "ol/proj/Units";
import { addCoordinateTransforms } from "ol/proj";
import { featureCollection } from "@turf/helpers";
import useClip from "./use-clip";
import { fromExtent as polygonFromExtent } from "ol/geom/Polygon";
import {
  fromProjectedCoord,
  toProjectedCoord,
  transformExtent,
} from "./services/coordinates";
import { Feature } from "ol";
import * as PrintArea from "./models/print-area";
import useVector from "./ol/use-vector";

const ppenProjection = new Projection({
  code: "ppen",
  units: Units.METERS,
  axisOrientation: "enu",
  global: false,
  metersPerUnit: 0.001,
});

export default function CourseLayer({ eventName, course, courseAppearance }) {
  const { map, mapFile, clipLayer } = useMap(getMap);
  const crs = useMemo(() => mapFile.getCrs(), [mapFile]);
  const mapProjection = useMemo(() => map?.getView().getProjection(), [map]);
  const paperToProjected = useCallback((c) => toProjectedCoord(crs, c), [crs]);
  const projectedToPaper = useCallback(
    (c) => fromProjectedCoord(crs, c),
    [crs]
  );

  useEffect(() => {
    if (mapProjection && crs) {
      addCoordinateTransforms(
        ppenProjection,
        mapProjection,
        paperToProjected,
        projectedToPaper
      );
    }
  }, [crs, mapProjection, paperToProjected, projectedToPaper]);

  const featuresRef = useRef([]);
  const mapScale = useMemo(() => mapFile.getCrs().scale, [mapFile]);
  const objScale = useMemo(
    () =>
      getObjectScale(courseAppearance.scaleSizes, mapScale, course.printScale),
    [courseAppearance, mapScale, course.printScale]
  );

  useEffect(() => {
    if (clipLayer) {
      const extent = transformExtent(
        PrintArea.getExtent(course.printArea, course),
        (c) => toProjectedCoord(crs, c)
      );
      const extentPolygon = polygonFromExtent(extent);
      const clipSource = clipLayer.getSource();
      clipSource.clear();
      clipSource.addFeature(new Feature(extentPolygon));
    }
  }, [clipLayer, course, crs]);

  const controlsGeoJSON = useControls(course.controls);
  const controlConnectionsGeoJSON = useControlConnections(
    course.controls,
    courseAppearance.autoLegGapSize,
    course.labelKind
  );
  const controlLabelsGeoJSON = useNumberPositions(
    course.controls,
    controlConnectionsGeoJSON,
    course.labelKind,
    objScale
  );
  const specialObjectsGeoJSON = useSpecialObjects(course.specialObjects);
  useControlDescriptions(
    map,
    paperToProjected,
    eventName,
    course,
    specialObjectsGeoJSON
  );

  const features = useMemo(() => {
    const geojson = new GeoJSON();
    return geojson.readFeatures(
      featureCollection([
        ...controlsGeoJSON.features,
        ...controlConnectionsGeoJSON.features,
        ...controlLabelsGeoJSON.features,
        ...specialObjectsGeoJSON.features,
      ]),
      { dataProjection: ppenProjection, featureProjection: mapProjection }
    );
  }, [
    controlsGeoJSON,
    controlConnectionsGeoJSON,
    controlLabelsGeoJSON,
    specialObjectsGeoJSON,
    mapProjection,
  ]);
  featuresRef.current = features;

  const { layer } = useVector(map, features, {
    layerOptions: {
      zIndex: 1,
      updateWhileAnimating: true,
      updateWhileInteracting: true,
    },
  });
  const style = useCallback(
    (feature, resolution) =>
      courseFeatureStyle(featuresRef, objScale, feature, resolution),
    [featuresRef, objScale]
  );
  useEffect(() => {
    layer.setStyle(style);
  }, [layer, style]);
  useClip(layer);

  return null;
}

function getMap({ map, mapFile, clipLayer }) {
  return { map, mapFile, clipLayer };
}

function getObjectScale(scaleSizes, mapScale, printScale) {
  // TODO: Need to verify that these are really correct
  // Especially the 1.5 for RelativeToMap looks weird but matches
  // output from some PDFs.
  switch (scaleSizes) {
    case "None":
      return printScale / mapScale;
    case "RelativeToMap":
      return 1.5;
    case "RelativeTo15000":
      return 15000 / mapScale;
    default:
      throw new Error(`Unknown scaleSizes mode "${scaleSizes}".`);
  }
}
