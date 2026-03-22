window.addEventListener("DOMContentLoaded", () => {
  const cursor = document.getElementById("cursor");
  const trail = document.getElementById("cursor-trail");

  if (!cursor || !trail) {
    console.error("cursor DOM 不存在");
    return;
  }

  document.addEventListener("mousemove", (e) => {
    cursor.style.left = e.clientX + "px";
    cursor.style.top = e.clientY + "px";

    trail.style.left = e.clientX + "px";
    trail.style.top = e.clientY + "px";
  });
});