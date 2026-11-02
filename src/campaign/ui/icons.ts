export const HUD_ART = {
  energy: new URL(
    "../../../assets/campaign/generated/icons/ui-energy-48.png",
    import.meta.url,
  ).href,
  hull: new URL(
    "../../../assets/campaign/generated/icons/ui-hull-48.png",
    import.meta.url,
  ).href,
  cargo: new URL(
    "../../../assets/campaign/generated/icons/ui-cargo-48.png",
    import.meta.url,
  ).href,
  depth: new URL(
    "../../../assets/campaign/generated/icons/ui-depth-48.png",
    import.meta.url,
  ).href,
  mission: new URL(
    "../../../assets/campaign/generated/icons/ui-mission-48.png",
    import.meta.url,
  ).href,
  drill: new URL(
    "../../../assets/campaign/generated/icons/icon-drill-64.png",
    import.meta.url,
  ).href,
  feet: new URL(
    "../../../assets/campaign/generated/icons/icon-feet-64.png",
    import.meta.url,
  ).href,
  rack: new URL(
    "../../../assets/campaign/generated/icons/icon-rack-64.png",
    import.meta.url,
  ).href,
  engine: new URL(
    "../../../assets/campaign/generated/icons/icon-engine-64.png",
    import.meta.url,
  ).href,
  map: new URL(
    "../../../assets/campaign/generated/icons/ui-map-48.png",
    import.meta.url,
  ).href,
  reservoir: new URL(
    "../../../assets/campaign/generated/icons/icon-energy-64.png",
    import.meta.url,
  ).href,
  bay: new URL(
    "../../../assets/campaign/generated/icons/icon-cargo-64.png",
    import.meta.url,
  ).href,
  armor: new URL(
    "../../../assets/campaign/generated/icons/icon-hull-64.png",
    import.meta.url,
  ).href,
  thermal: new URL(
    "../../../assets/campaign/generated/w02-icons/w02-r1-icon-64.png",
    import.meta.url,
  ).href,
  condenser: new URL(
    "../../../assets/campaign/generated/w02-icons/w02-r2-icon-64.png",
    import.meta.url,
  ).href,
  preservation: new URL(
    "../../../assets/campaign/generated/w02-icons/w02-r3-icon-64.png",
    import.meta.url,
  ).href,
  core: new URL(
    "../../../assets/campaign/generated/icons/icon-core-64.png",
    import.meta.url,
  ).href,
};
export function hudIcon(name: keyof typeof HUD_ART, className = "") {
  return (
    '<img class="hud-icon ' +
    className +
    '" src="' +
    HUD_ART[name] +
    '" alt="" aria-hidden="true">'
  );
}
