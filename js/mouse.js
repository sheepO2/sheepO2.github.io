window.addEventListener("DOMContentLoaded", () => {
  const cursor = document.getElementById("cursor");
  const trail = document.getElementById("cursor-trail");
  const trailSpacing = 22;
  let lastTrailPoint = null;

  if (!cursor || !trail) {
    console.error("Custom cursor elements are missing.");
    return;
  }

  function clearTrail() {
    trail.replaceChildren();
    lastTrailPoint = null;
  }

  function leaveFootprint(point, angle) {
    const step = document.createElement("span");
    step.className = "cursor-trail__step";
    step.style.left = point.x + "px";
    step.style.top = point.y + "px";
    step.style.setProperty("--trail-angle", angle + "deg");
    step.addEventListener("animationend", () => step.remove(), { once: true });
    trail.appendChild(step);
  }

  document.addEventListener("mousemove", (event) => {
    const point = { x: event.clientX + 42, y: event.clientY + 38 };
    cursor.style.left = event.clientX + "px";
    cursor.style.top = event.clientY + "px";

    if (document.body.classList.contains("giscus-cursor-active")) return;

    if (!lastTrailPoint) {
      lastTrailPoint = point;
      return;
    }

    const deltaX = point.x - lastTrailPoint.x;
    const deltaY = point.y - lastTrailPoint.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance < trailSpacing) return;

    const angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
    leaveFootprint(point, angle);
    lastTrailPoint = point;
  });

  document.addEventListener("mouseleave", () => {
    cursor.style.opacity = "0";
    clearTrail();
  });

  document.addEventListener("mouseenter", () => {
    cursor.style.opacity = "1";
  });

  const giscusSelector = "#giscus, #giscus-container, .giscus, iframe.giscus-frame";
  const isInGiscus = (node) => node instanceof Element && Boolean(node.closest(giscusSelector));

  function setGiscusCursor(active) {
    document.body.classList.toggle("giscus-cursor-active", active);
    if (active) clearTrail();
  }

  document.addEventListener("mouseover", (event) => {
    if (isInGiscus(event.target)) setGiscusCursor(true);
  });

  document.addEventListener("mouseout", (event) => {
    if (isInGiscus(event.target) && !isInGiscus(event.relatedTarget)) {
      setGiscusCursor(false);
    }
  });
});
