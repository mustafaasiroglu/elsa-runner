(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const canvas = $("game");
  const ctx = canvas.getContext("2d");
  const MAX_JUMP_HOLD = .18;
  const JUMP_HOLD_BOOST = 680;
  const OBSTACLE_DELAY_START = 1.65;
  const OBSTACLE_DELAY_VARIANCE = 1.2;
  const OBSTACLE_DELAY_REDUCTION = .2;
  const OBSTACLE_DELAY_REDUCTION_TIME = 240;
  const ui = {
    score: $("score"), flakes: $("flakes"), best: $("best-score"), finalScore: $("final-score"),
    finalFlakes: $("final-flakes"), start: $("start-screen"), pause: $("pause-screen"),
    over: $("game-over-screen"), play: $("play-button"), again: $("again-button"),
    resume: $("resume-button"), pauseButton: $("pause-button"), sound: $("sound-button"),
    fullscreen: $("fullscreen-button")
  };
  const storage = {
    get(key, fallback) { try { const value = localStorage.getItem(key); return value === null ? fallback : value; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } }
  };
  const state = {
    status: "start", width: 0, height: 0, ground: 0, time: 0, distance: 0, score: 0, flakes: 0,
    best: Number(storage.get("snowySkiesBest", "0")) || 0, muted: storage.get("snowySkiesMuted", "false") === "true",
    player: null, obstacles: [], collectibles: [], particles: [], snow: [], clouds: [], nextObstacle: 1.5,
    nextCollectible: 2.5, lastFrame: 0, shake: 0
  };
  const audio = {
    context: null,
    play(kind) {
      if (state.muted) return;
      try {
        this.context ||= new (window.AudioContext || window.webkitAudioContext)();
        const frequencies = { jump: [440, 620], collect: [740, 1040], hit: [200, 100] };
        const [start, end] = frequencies[kind] || [500, 500];
        const oscillator = this.context.createOscillator(), gain = this.context.createGain();
        oscillator.type = kind === "hit" ? "triangle" : "sine";
        oscillator.frequency.setValueAtTime(start, this.context.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(end, this.context.currentTime + .16);
        gain.gain.setValueAtTime(.09, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(.001, this.context.currentTime + .2);
        oscillator.connect(gain).connect(this.context.destination); oscillator.start(); oscillator.stop(this.context.currentTime + .21);
      } catch { /* Sound is optional. */ }
    }
  };

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    state.width = canvas.clientWidth; state.height = canvas.clientHeight; state.ground = state.height * .78;
    canvas.width = Math.floor(state.width * ratio); canvas.height = Math.floor(state.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (state.player) state.player.y = Math.min(state.player.y, state.ground - state.player.h);
    makeSky();
  }
  function makeSky() {
    state.snow = Array.from({ length: Math.max(35, Math.floor(state.width / 13)) }, () => ({
      x: Math.random() * state.width, y: Math.random() * state.height, r: 1 + Math.random() * 2, drift: .2 + Math.random() * .7
    }));
    state.clouds = Array.from({ length: 5 }, (_, i) => ({ x: i * state.width / 4 + Math.random() * 120, y: 55 + Math.random() * state.height * .27, size: 30 + Math.random() * 30 }));
  }
  function reset() {
    state.time = state.distance = state.score = state.flakes = state.shake = 0;
    state.obstacles = []; state.collectibles = []; state.particles = []; state.nextObstacle = 1.45; state.nextCollectible = 2.2;
    state.player = { x: state.width * .18, y: state.ground - 64, w: 52, h: 64, vy: 0, onGround: true, squish: 0, jumpHeld: false, holdTime: 0 };
    updateUi();
  }
  function start() {
    reset(); state.status = "playing"; hide(ui.start); hide(ui.over); hide(ui.pause); audio.play("collect");
  }
  function pause() {
    if (state.status !== "playing") return;
    state.status = "paused"; show(ui.pause); ui.pauseButton.textContent = "▶";
  }
  function resume() {
    if (state.status !== "paused") return;
    state.status = "playing"; hide(ui.pause); ui.pauseButton.textContent = "Ⅱ";
  }
  function end() {
    state.status = "over"; state.shake = .25; audio.play("hit");
    state.best = Math.max(state.best, state.score); storage.set("snowySkiesBest", state.best);
    ui.finalScore.textContent = state.score; ui.finalFlakes.textContent = state.flakes; updateUi(); show(ui.over);
  }
  function jump() {
    if (state.status === "start" || state.status === "over") { start(); return; }
    if (state.status === "paused") { resume(); return; }
    const p = state.player;
    if (p.onGround) { p.vy = -Math.max(575, state.height * .86); p.onGround = false; p.jumpHeld = true; p.holdTime = 0; p.squish = -.18; audio.play("jump"); }
  }
  function speed() { return Math.min(260, 125 + Math.floor(state.time / 24) * 15); }
  function spawnObstacle() {
    const types = ["rock", "snowfriend", "bush", "hill"];
    const type = types[Math.floor(Math.random() * types.length)];
    const h = type === "hill" ? 28 : type === "snowfriend" ? 54 : 38;
    state.obstacles.push({ type, x: state.width + 50, y: state.ground - h, w: type === "hill" ? 62 : 42, h });
  }
  function spawnCollectible() {
    state.collectibles.push({ x: state.width + 40, y: state.ground - 95 - Math.random() * 85, r: 13, spin: Math.random() * 6 });
  }
  function burst(x, y, color) {
    for (let i = 0; i < 9; i++) state.particles.push({ x, y, dx: (Math.random() - .5) * 110, dy: (Math.random() - .5) * 110, life: .55, color });
  }
  function collide(a, b) {
    const padX = 10, padY = 7;
    return a.x + padX < b.x + b.w && a.x + a.w - padX > b.x && a.y + padY < b.y + b.h && a.y + a.h - padY > b.y;
  }
  function update(dt) {
    if (state.status !== "playing") return;
    state.time += dt; state.distance += speed() * dt; state.score = Math.floor(state.distance / 13) + state.flakes * 10;
    const p = state.player;
    if (p.jumpHeld && p.vy < 0 && p.holdTime < MAX_JUMP_HOLD) { p.vy -= JUMP_HOLD_BOOST * dt; p.holdTime += dt; }
    p.vy += 1350 * dt; p.y += p.vy * dt; p.squish *= Math.pow(.001, dt);
    if (p.y >= state.ground - p.h) { if (!p.onGround && p.vy > 220) p.squish = .16; p.y = state.ground - p.h; p.vy = 0; p.onGround = true; p.jumpHeld = false; }
    state.nextObstacle -= dt; state.nextCollectible -= dt;
    if (state.nextObstacle <= 0) { spawnObstacle(); state.nextObstacle = OBSTACLE_DELAY_START + Math.random() * OBSTACLE_DELAY_VARIANCE - Math.min(OBSTACLE_DELAY_REDUCTION, state.time / OBSTACLE_DELAY_REDUCTION_TIME); }
    if (state.nextCollectible <= 0) { spawnCollectible(); state.nextCollectible = 1.25 + Math.random() * 1.7; }
    const movement = speed() * dt;
    state.obstacles.forEach((o) => o.x -= movement);
    state.collectibles.forEach((c) => { c.x -= movement; c.spin += dt * 7; });
    state.obstacles = state.obstacles.filter((o) => o.x + o.w > -20);
    state.collectibles = state.collectibles.filter((c) => {
      if (c.x + c.r < -20) return false;
      if (collide(p, { x: c.x - c.r, y: c.y - c.r, w: c.r * 2, h: c.r * 2 })) { state.flakes++; burst(c.x, c.y, "#fff4a8"); audio.play("collect"); return false; }
      return true;
    });
    if (state.obstacles.some((o) => collide(p, o))) end();
    state.particles = state.particles.filter((p) => { p.life -= dt; p.x += p.dx * dt; p.y += p.dy * dt; return p.life > 0; });
    state.snow.forEach((s) => { s.x -= speed() * s.drift * dt * .25; s.y += 10 * s.drift * dt; if (s.x < -5) s.x = state.width + 5; if (s.y > state.height) s.y = -5; });
    state.clouds.forEach((c) => { c.x -= 6 * dt; if (c.x < -c.size * 3) c.x = state.width + c.size; });
    updateUi();
  }
  function roundRect(x, y, w, h, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
  function star(x, y, r, color) { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = color; ctx.fillRect(-r / 2, -r / 2, r, r); ctx.restore(); }
  function render() {
    const { width: w, height: h, ground, distance } = state; ctx.clearRect(0, 0, w, h);
    const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, "#8edcf8"); sky.addColorStop(.7, "#d9f6ff"); sky.addColorStop(1, "#f5fdff"); ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(160,92,210,.16)"; ctx.beginPath(); ctx.ellipse(w * .68, h * .19, w * .42, h * .13, -.2, 0, Math.PI * 2); ctx.fill();
    state.clouds.forEach((c) => drawCloud(c));
    drawMountains(distance); drawCastle(w * .69, ground - 100); drawTrees(distance);
    ctx.fillStyle = "#e6fbff"; ctx.fillRect(0, ground, w, h - ground); ctx.fillStyle = "#beeafa";
    for (let x = -(distance % 38); x < w; x += 38) ctx.fillRect(x, ground + 20, 20, 3);
    ctx.save(); if (state.shake > 0) { state.shake -= .016; ctx.translate((Math.random() - .5) * 7, (Math.random() - .5) * 7); }
    state.collectibles.forEach(drawFlake); state.obstacles.forEach(drawObstacle); if (state.player) drawPrincess(state.player); ctx.restore();
    state.particles.forEach((p) => { ctx.globalAlpha = p.life * 1.8; star(p.x, p.y, 5, p.color); }); ctx.globalAlpha = 1;
    state.snow.forEach((s) => { ctx.fillStyle = "rgba(255,255,255,.86)"; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); });
  }
  function drawCloud(c) { ctx.fillStyle = "rgba(255,255,255,.7)"; [0, .5, 1].forEach((n) => { ctx.beginPath(); ctx.arc(c.x + n * c.size, c.y + (n === .5 ? -c.size * .22 : 0), c.size * .52, 0, Math.PI * 2); ctx.fill(); }); }
  function drawMountains(d) { for (let i = -1; i < 5; i++) { const x = i * state.width * .32 - (d * .08 % (state.width * .32)); ctx.fillStyle = "#a6d6ed"; ctx.beginPath(); ctx.moveTo(x, state.ground); ctx.lineTo(x + state.width * .17, state.ground - 145); ctx.lineTo(x + state.width * .34, state.ground); ctx.fill(); ctx.fillStyle = "#dff9ff"; ctx.beginPath(); ctx.moveTo(x + state.width * .17, state.ground - 145); ctx.lineTo(x + state.width * .12, state.ground - 103); ctx.lineTo(x + state.width * .19, state.ground - 116); ctx.lineTo(x + state.width * .23, state.ground - 90); ctx.fill(); } }
  function drawCastle(x, y) { ctx.fillStyle = "#b9e8f8"; ctx.fillRect(x, y, 83, 103); [0, 32, 65].forEach((offset) => { ctx.fillRect(x + offset, y - 33, 19, 48); ctx.beginPath(); ctx.moveTo(x + offset - 4, y - 33); ctx.lineTo(x + offset + 9, y - 54); ctx.lineTo(x + offset + 23, y - 33); ctx.fill(); }); ctx.fillStyle = "#fff3a5"; for (let i = 0; i < 3; i++) ctx.fillRect(x + 12 + i * 23, y + 27, 7, 12); }
  function drawTrees(d) { for (let i = -1; i < 8; i++) { const x = i * 108 - (d * .28 % 108), y = state.ground - 3; ctx.fillStyle = "#79c8cf"; ctx.fillRect(x + 22, y - 30, 6, 30); ["#bff1ed", "#9be0df", "#78c8d1"].forEach((color, n) => { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y - 13 - n * 13); ctx.lineTo(x + 25, y - 59 - n * 13); ctx.lineTo(x + 50, y - 13 - n * 13); ctx.fill(); }); } }
  function drawPrincess(p) {
    const bounce = p.onGround ? Math.sin(state.time * 15) * 2 : 0, scaleY = 1 + p.squish, scaleX = 1 - p.squish * .45;
    ctx.save(); ctx.translate(p.x + p.w / 2, p.y + p.h); ctx.scale(scaleX, scaleY); ctx.translate(-p.w / 2, -p.h);
    ctx.strokeStyle = "#e7ad20"; ctx.lineWidth = 7; ctx.lineCap = "round";
    [[12, 25, 7, 48, 13, 62], [40, 25, 45, 48, 39, 62]].forEach((braid) => {
      ctx.beginPath(); ctx.moveTo(braid[0], braid[1] + bounce); ctx.quadraticCurveTo(braid[2], braid[3] + bounce, braid[4], braid[5] + bounce); ctx.stroke();
      ctx.fillStyle = "#ff79a9"; ctx.fillRect(braid[4] - 3, braid[5] - 2 + bounce, 6, 5);
    });
    roundRect(12, 29 + bounce, 29, 31, 10, "#74d5f5");
    ctx.fillStyle = "#c6f4ff"; ctx.beginPath(); ctx.moveTo(12, 34 + bounce); ctx.lineTo(3, 63); ctx.lineTo(27, 53); ctx.lineTo(49, 63); ctx.lineTo(41, 34 + bounce); ctx.fill();
    ctx.fillStyle = "#9b79de"; ctx.fillRect(15, 35 + bounce, 24, 5); ctx.fillStyle = "#fff4a8"; ctx.fillRect(24, 36 + bounce, 6, 18);
    ctx.fillStyle = "#f7c6b5"; ctx.beginPath(); ctx.arc(26, 21 + bounce, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f5c83c"; ctx.beginPath(); ctx.arc(26, 15 + bounce, 20, Math.PI, Math.PI * 2); ctx.fill(); ctx.fillRect(7, 14 + bounce, 11, 10); ctx.fillRect(34, 14 + bounce, 11, 10);
    ctx.fillStyle = "#305c9e"; [19, 33].forEach((x) => { ctx.beginPath(); ctx.arc(x, 23 + bounce, 3.5, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = "#ed849d"; ctx.beginPath(); ctx.arc(26, 31 + bounce, 4, 0, Math.PI); ctx.fill(); ctx.restore();
  }
  function drawObstacle(o) { if (o.type === "snowfriend") { ctx.fillStyle = "#f9feff"; ctx.beginPath(); ctx.arc(o.x + 21, o.y + 37, 17, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(o.x + 21, o.y + 18, 12, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#ff9f61"; ctx.fillRect(o.x + 21, o.y + 19, 10, 3); } else if (o.type === "bush") { roundRect(o.x, o.y + 12, o.w, o.h - 12, 16, "#75cfcf"); ctx.fillStyle = "#d4fbff"; ctx.fillRect(o.x + 5, o.y + 13, o.w - 10, 5); } else { ctx.fillStyle = o.type === "hill" ? "#a9e3f6" : "#78c5e6"; ctx.beginPath(); ctx.moveTo(o.x, o.y + o.h); ctx.quadraticCurveTo(o.x + o.w / 2, o.y - 10, o.x + o.w, o.y + o.h); ctx.fill(); ctx.fillStyle = "#e1faff"; ctx.beginPath(); ctx.moveTo(o.x + 6, o.y + o.h - 8); ctx.lineTo(o.x + o.w / 2, o.y); ctx.lineTo(o.x + o.w - 8, o.y + o.h - 8); ctx.fill(); } }
  function drawFlake(c) { ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.spin); ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-c.r, 0); ctx.lineTo(c.r, 0); ctx.stroke(); } ctx.restore(); }
  function updateUi() { ui.score.textContent = state.score; ui.flakes.textContent = state.flakes; ui.best.textContent = state.best; }
  function show(element) { element.classList.remove("hidden"); } function hide(element) { element.classList.add("hidden"); }
  function frame(now) { const dt = Math.min(.035, (now - state.lastFrame) / 1000 || 0); state.lastFrame = now; update(dt); render(); requestAnimationFrame(frame); }
  ui.play.addEventListener("click", start); ui.again.addEventListener("click", start); ui.resume.addEventListener("click", resume);
  ui.pauseButton.addEventListener("click", () => state.status === "playing" ? pause() : resume());
  ui.sound.addEventListener("click", () => { state.muted = !state.muted; storage.set("snowySkiesMuted", state.muted); ui.sound.textContent = state.muted ? "🔇 Sound" : "🔊 Sound"; ui.sound.setAttribute("aria-pressed", String(!state.muted)); if (!state.muted) audio.play("collect"); });
  ui.fullscreen.addEventListener("click", async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); storage.set("snowySkiesFullscreen", String(Boolean(document.fullscreenElement))); } catch { /* Fullscreen is optional. */ } });
  canvas.addEventListener("pointerdown", (event) => { if (event.pointerType === "mouse" && event.button !== 0) return; event.preventDefault(); canvas.setPointerCapture?.(event.pointerId); jump(); });
  function endPointerJump(event) {
    if (state.player) state.player.jumpHeld = false;
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture?.(event.pointerId);
  }
  canvas.addEventListener("pointerup", endPointerJump);
  canvas.addEventListener("pointercancel", endPointerJump);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("keydown", (event) => { if (event.code === "Space") { event.preventDefault(); jump(); } });
  window.addEventListener("keyup", (event) => { if (event.code === "Space" && state.player) state.player.jumpHeld = false; });
  window.addEventListener("blur", pause); document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  window.addEventListener("resize", resize); resize(); reset(); ui.sound.textContent = state.muted ? "🔇 Sound" : "🔊 Sound"; ui.sound.setAttribute("aria-pressed", String(!state.muted)); requestAnimationFrame(frame);
})();
