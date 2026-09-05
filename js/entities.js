// Enemy, Projectile/Effect and Tower classes — all procedural canvas art built
// from gradients, glow (shadowBlur) and organic curves, matching the engine's
// no-image-assets approach. Each attack kind gets a distinct behaviour:
//   bolt      -> Software Engineer: fast homing single-target fix
//   lob       -> SRE/DevOps: arcing rollback that splash-resolves several bugs
//   lightning -> QA Engineer: instant test-run hit that also flags a 2nd bug
//   income    -> Product Manager: generates Budget over time (scales w/ rank)
//   aura      -> Coffee Machine: no attack, buffs every teammate's damage
//                and fire rate company-wide — read live by Core (see
//                Core.auraDmgMultFor/auraRateMultFor in game.js) rather than
//                cached, so there's no staleness to manage.
(function () {
  const CFG = window.Game.Config;

  function jaggedPoints(x1, y1, x2, y2, segments, jitter) {
    const pts = [{ x: x1, y: y1 }];
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const bx = x1 + (x2 - x1) * t;
      const by = y1 + (y2 - y1) * t;
      const nx = -(y2 - y1), ny = (x2 - x1);
      const len = Math.hypot(nx, ny) || 1;
      const off = (Math.random() - 0.5) * jitter;
      pts.push({ x: bx + (nx / len) * off, y: by + (ny / len) * off });
    }
    pts.push({ x: x2, y: y2 });
    return pts;
  }

  // Shared by every enemy's draw method (sprite, blob, flame, competitor) —
  // each just differs in where the bar sits above the enemy, everything else
  // (size, color-by-fraction, backing shadow) was identical duplicated code.
  function drawHealthBar(ctx, cx, barY, radius, hp, maxHp) {
    const w = radius * 2, h = 4;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(cx - w / 2, barY, w, h);
    ctx.fillStyle = hp / maxHp > 0.4 ? '#5fd35f' : '#e0503c';
    ctx.fillRect(cx - w / 2, barY, w * (hp / maxHp), h);
  }

  function strokeGlowPath(ctx, pts, color, glow, width) {
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.shadowColor = glow; ctx.shadowBlur = 16;
    ctx.strokeStyle = glow;
    ctx.lineWidth = width + 3;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- Enemy --
  // Bug / Incident share an organic wobbly-blob body (bugs gain antennae+legs,
  // incidents gain a persistent alert ring + "!" glyph). Competitor breaks
  // from the blob style entirely for a rigid chevron w/ a speed trail — its
  // rigidity IS the "sleek and fast" read.
  class Enemy {
    constructor(type, waypoints, tier) {
      const def = CFG.ENEMY_TYPES[type];
      const hpMult = 1 + (tier || 0) * CFG.ENDLESS_HP_GROWTH;
      const spMult = 1 + (tier || 0) * CFG.ENDLESS_SPEED_GROWTH;
      this.type = type;
      this.def = def;
      this.maxHp = def.hp * hpMult;
      this.hp = this.maxHp;
      this.speed = def.speed * spMult;
      this.leakCost = def.leakCost;
      this.bounty = def.bounty;
      this.radius = def.radius;
      this.color = def.color;
      this.glow = def.glow;
      this.waypoints = waypoints;
      this.wpIndex = 0;
      this.x = waypoints[0].x;
      this.y = waypoints[0].y;
      this.slowTimer = 0;
      this.slowFactor = 0;
      this.dead = false;
      this.reachedEnd = false;
      this.hitFlash = 0;
      this.walkPhase = Math.random() * Math.PI * 2;
      this.alertPhase = Math.random() * Math.PI * 2;
      this.blobSeed = Array.from({ length: 7 }, () => Math.random() * Math.PI * 2);
      this.trail = [];
      this.facing = 1; // 1 = facing right, -1 = facing left — drives sprite flip
    }
    get effectiveSpeed() { return this.slowTimer > 0 ? this.speed * (1 - this.slowFactor) : this.speed; }
    applySlow(factor, duration) {
      if (factor > this.slowFactor || this.slowTimer <= 0) this.slowFactor = factor;
      this.slowTimer = Math.max(this.slowTimer, duration / 1000);
    }
    takeDamage(dmg) {
      this.hp -= dmg;
      this.hitFlash = 0.14;
      if (this.hp <= 0) this.dead = true;
    }
    update(dt) {
      if (this.slowTimer > 0) { this.slowTimer -= dt; if (this.slowTimer < 0) this.slowTimer = 0; }
      if (this.hitFlash > 0) this.hitFlash -= dt;
      this.walkPhase += dt * 5;
      const target = this.waypoints[this.wpIndex + 1];
      if (!target) { this.reachedEnd = true; return; }
      const dx = target.x - this.x, dy = target.y - this.y;
      if (dx > 0.5) this.facing = 1; else if (dx < -0.5) this.facing = -1;
      const dist = Math.hypot(dx, dy);
      const step = this.effectiveSpeed * dt;
      if (step >= dist) {
        this.x = target.x; this.y = target.y;
        this.wpIndex++;
        if (this.wpIndex >= this.waypoints.length - 1) this.reachedEnd = true;
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
      if (this.type === 'competitor') {
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 8) this.trail.shift();
      }
    }
    draw(ctx) {
      if (this.type === 'incident') { this.drawFlame(ctx); return; } // always procedural — fire is a particle effect, not a sprite
      if (this.drawSprite(ctx, 'enemy_' + this.type)) return;
      if (this.type === 'competitor') this.drawCompetitor(ctx);
      else this.drawBlob(ctx);
    }
    // Real generated art for bug/competitor, when available — falls back to
    // the procedural blob/chevron shapes above if the sprite hasn't loaded.
    drawSprite(ctx, key) {
      const img = window.Game.Assets.get(key);
      if (!img) return false;
      const bob = Math.sin(this.walkPhase) * 2.5;
      // Squash/stretch + a slight alternating tilt sells a step/hop instead
      // of a pure vertical float; horizontal flip faces the sprite the way
      // it's actually walking. Different enemy art faces different default
      // directions (the bug's art already faces right; the competitor's
      // rocket art faces left), so each type's `artFacing` (config.js)
      // composes with the live movement direction rather than assuming one
      // shared default.
      const artFacing = this.def.artFacing || 1;
      const squash = 1 + Math.sin(this.walkPhase) * 0.05;
      const tilt = Math.sin(this.walkPhase + Math.PI / 2) * 0.06 * this.facing;
      const targetH = this.radius * 3.2;
      const rw = targetH * (img.naturalWidth / img.naturalHeight);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(this.x, this.y + this.radius * 0.8, this.radius * 0.85, this.radius * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      ctx.translate(this.x, this.y + bob);
      ctx.rotate(tilt);
      ctx.scale((this.facing * artFacing) / squash, squash);
      if (this.hitFlash > 0) ctx.filter = 'brightness(1.9) saturate(0.2)';
      ctx.drawImage(img, -rw / 2, -targetH * 0.8, rw, targetH);
      ctx.restore();
      if (this.slowTimer > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(160,225,255,0.85)'; ctx.lineWidth = 2;
        ctx.shadowColor = '#aef6ff'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(this.x, this.y + bob, this.radius + 5, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      if (this.hp < this.maxHp) drawHealthBar(ctx, this.x, this.y - targetH * 0.6, this.radius, this.hp, this.maxHp);
      return true;
    }
    drawBlob(ctx) {
      const t = window.Game.Core.gameTime; // frozen while paused
      const bob = Math.sin(this.walkPhase) * 2.5;
      const squash = this.slowTimer > 0 ? 0.9 : 1;
      ctx.save();
      ctx.translate(this.x, this.y + bob);

      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(0, this.radius * 0.8, this.radius * 0.85, this.radius * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.scale(squash, 1 / squash * 0.94 + 0.06);
      ctx.shadowColor = this.hitFlash > 0 ? '#ffffff' : this.glow;
      ctx.shadowBlur = this.hitFlash > 0 ? 22 : 12;

      const n = this.blobSeed.length;
      const pts = this.blobSeed.map((seed, i) => {
        const ang = (i / n) * Math.PI * 2;
        const r = this.radius * (1 + 0.14 * Math.sin(t * 2.6 + seed));
        return { x: Math.cos(ang) * r, y: Math.sin(ang) * r * 0.92 };
      });
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const p0 = pts[i], p1 = pts[(i + 1) % n];
        const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
        if (i === 0) ctx.moveTo(mx, my);
        ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
      }
      ctx.closePath();

      const grad = ctx.createRadialGradient(-this.radius * 0.3, -this.radius * 0.3, 1, 0, 0, this.radius * 1.3);
      if (this.hitFlash > 0) {
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(1, this.glow);
      } else {
        grad.addColorStop(0, this.glow);
        grad.addColorStop(1, this.color);
      }
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(12,12,15,0.85)';
      ctx.beginPath(); ctx.ellipse(-this.radius * 0.32, -this.radius * 0.05, 2.4, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(this.radius * 0.32, -this.radius * 0.05, 2.4, 3, 0, 0, Math.PI * 2); ctx.fill();

      if (this.type === 'bug') {
        const flap = Math.sin(this.walkPhase * 3) * 0.5 + 0.5;
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = 'rgba(200,255,220,0.7)';
        ctx.beginPath();
        ctx.ellipse(-this.radius * 0.5, -this.radius * 0.15, this.radius * 0.55, this.radius * (0.22 + flap * 0.14), -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(this.radius * 0.5, -this.radius * 0.15, this.radius * 0.55, this.radius * (0.22 + (1 - flap) * 0.14), 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = 'rgba(15,35,22,0.8)'; ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-this.radius * 0.2, -this.radius * 0.85);
        ctx.quadraticCurveTo(-this.radius * 0.5, -this.radius * 1.5, -this.radius * 0.75, -this.radius * 1.65);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(this.radius * 0.2, -this.radius * 0.85);
        ctx.quadraticCurveTo(this.radius * 0.5, -this.radius * 1.5, this.radius * 0.75, -this.radius * 1.65);
        ctx.stroke();
        ctx.fillStyle = 'rgba(15,35,22,0.8)';
        ctx.beginPath(); ctx.arc(-this.radius * 0.75, -this.radius * 1.65, 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(this.radius * 0.75, -this.radius * 1.65, 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 3; i++) {
          const swing = Math.sin(this.walkPhase * 1.5 + i) * 6;
          const ly = -this.radius * 0.2 + i * this.radius * 0.35;
          ctx.beginPath(); ctx.moveTo(-this.radius * 0.85, ly); ctx.lineTo(-this.radius * 1.25, ly + swing); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(this.radius * 0.85, ly); ctx.lineTo(this.radius * 1.25, ly - swing); ctx.stroke();
        }
      }

      if (this.slowTimer > 0) {
        ctx.strokeStyle = 'rgba(160,225,255,0.85)';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#aef6ff'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(0, 0, this.radius + 5, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.restore();

      if (this.hp < this.maxHp) drawHealthBar(ctx, this.x, this.y - this.radius - 12, this.radius, this.hp, this.maxHp);
    }
    // Incidents render as an actual flame — three layered, flickering flame
    // tongues (outer red, mid orange, inner yellow-white) with rising embers,
    // instead of the blob body other enemies use.
    drawFlame(ctx) {
      const t = window.Game.Core.gameTime; // frozen while paused
      const bob = Math.sin(this.walkPhase) * 2;
      const r = this.radius;
      ctx.save();
      ctx.translate(this.x, this.y + bob);

      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(0, r * 0.85, r * 0.8, r * 0.26, 0, 0, Math.PI * 2); ctx.fill();

      const flick = (i) => Math.sin(t * 9 + i * 2.1 + this.alertPhase) * 0.12;
      ctx.shadowColor = this.hitFlash > 0 ? '#ffffff' : '#ffcf4d';
      ctx.shadowBlur = this.hitFlash > 0 ? 22 : 14;

      const flameLayer = (scale, colorA, colorB, tOffset) => {
        const baseW = r * 0.9 * scale;
        const h = r * 2.1 * scale;
        ctx.beginPath();
        ctx.moveTo(-baseW * 0.5, r * 0.5);
        ctx.quadraticCurveTo(-baseW * (0.75 + flick(tOffset)), -h * 0.25, -baseW * 0.15 * (1 + flick(tOffset + 1)), -h * 0.75);
        ctx.quadraticCurveTo(0, -h * (1 + flick(tOffset + 2) * 0.4), baseW * 0.15 * (1 + flick(tOffset + 3)), -h * 0.75);
        ctx.quadraticCurveTo(baseW * (0.75 + flick(tOffset + 4)), -h * 0.25, baseW * 0.5, r * 0.5);
        ctx.closePath();
        if (this.hitFlash > 0) { ctx.fillStyle = '#ffffff'; }
        else {
          const g = ctx.createLinearGradient(0, r * 0.5, 0, -h);
          g.addColorStop(0, colorA); g.addColorStop(1, colorB);
          ctx.fillStyle = g;
        }
        ctx.fill();
      };
      flameLayer(1, '#c23a1e', '#ff7a2e', 0);
      flameLayer(0.68, '#ff8a2e', '#ffcf4d', 3);
      flameLayer(0.36, '#ffe27a', '#fff6d0', 6);
      ctx.shadowBlur = 0;

      for (let i = 0; i < 3; i++) {
        const life = (t * 0.8 + i / 3 + this.alertPhase) % 1;
        const ey = r * 0.4 - life * r * 2.6;
        const ex = Math.sin(t * 3 + i * 2) * r * 0.35 * life;
        ctx.globalAlpha = Math.max(0, 1 - life);
        ctx.fillStyle = '#ffcf4d';
        ctx.beginPath(); ctx.arc(ex, ey, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (this.slowTimer > 0) {
        ctx.strokeStyle = 'rgba(160,225,255,0.85)'; ctx.lineWidth = 2;
        ctx.shadowColor = '#aef6ff'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(0, 0, r + 6, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.restore();

      if (this.hp < this.maxHp) drawHealthBar(ctx, this.x, this.y - r * 2.4 - 8, r, this.hp, this.maxHp);
    }
    drawCompetitor(ctx) {
      for (let i = 0; i < this.trail.length; i++) {
        const p = this.trail[i];
        ctx.globalAlpha = (i / this.trail.length) * 0.35;
        ctx.fillStyle = this.glow;
        ctx.beginPath(); ctx.arc(p.x, p.y, this.radius * 0.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      const aimTarget = this.waypoints[this.wpIndex + 1] || this.waypoints[this.wpIndex];
      const ang = Math.atan2(aimTarget.y - this.y, aimTarget.x - this.x);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(ang);
      ctx.shadowColor = this.hitFlash > 0 ? '#ffffff' : this.glow;
      ctx.shadowBlur = this.hitFlash > 0 ? 20 : 10;
      const grad = ctx.createLinearGradient(-this.radius, 0, this.radius * 1.3, 0);
      if (this.hitFlash > 0) { grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#ffffff'); }
      else { grad.addColorStop(0, this.color); grad.addColorStop(1, '#fff6ec'); }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(this.radius * 1.3, 0);
      ctx.lineTo(-this.radius * 0.6, -this.radius * 0.8);
      ctx.lineTo(-this.radius * 0.15, 0);
      ctx.lineTo(-this.radius * 0.6, this.radius * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();

      if (this.hp < this.maxHp) drawHealthBar(ctx, this.x, this.y - this.radius - 12, this.radius, this.hp, this.maxHp);
    }
  }

  // ----------------------------------------------------------- Projectile --
  // Handles 'bolt' (homing light shard, Engineer) and 'lob' (arcing rollback, SRE).
  class Projectile {
    constructor(opts) {
      Object.assign(this, opts);
      this.dead = false;
      this.trail = [];
      this.elapsed = 0;
      if (this.kind === 'lob') {
        const dist = Math.hypot(this.targetX - this.x, this.targetY - this.y);
        this.duration = Math.max(0.15, dist / this.speed);
        this.startX = this.x; this.startY = this.y;
        this.arcHeight = 34 + dist * 0.08;
      }
    }
    update(dt, enemies, particles) {
      if (this.kind === 'lob') {
        this.elapsed += dt;
        const t = Math.min(1, this.elapsed / this.duration);
        this.x = this.startX + (this.targetX - this.startX) * t;
        this.groundY = this.startY + (this.targetY - this.startY) * t;
        this.y = this.groundY - this.arcHeight * Math.sin(Math.PI * t);
        if (Math.random() < 0.6) {
          particles.push({
            x: this.x + (Math.random() - 0.5) * 4, y: this.y + (Math.random() - 0.5) * 4,
            vx: (Math.random() - 0.5) * 10, vy: -10 - Math.random() * 15,
            life: 0.35, maxLife: 0.35, color: Math.random() < 0.5 ? '#ffcf8a' : '#f2a340'
          });
        }
        if (t >= 1) { this.impact(enemies); this.dead = true; }
        return;
      }

      // 'bolt': homes toward live target, fast, fading trail
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 6) this.trail.shift();
      let tx, ty;
      if (this.target && !this.target.dead && !this.target.reachedEnd) {
        tx = this.target.x; ty = this.target.y;
        this.lastX = tx; this.lastY = ty;
      } else {
        tx = this.lastX !== undefined ? this.lastX : this.x;
        ty = this.lastY !== undefined ? this.lastY : this.y;
      }
      const dx = tx - this.x, dy = ty - this.y;
      const dist = Math.hypot(dx, dy);
      const step = this.speed * dt;
      if (step >= dist || dist < 4) { this.impact(enemies); this.dead = true; }
      else { this.x += (dx / dist) * step; this.y += (dy / dist) * step; }
    }
    impact(enemies) {
      const audio = window.Game.Audio;
      const core = window.Game.Core;
      if (this.kind === 'lob') {
        audio.sreImpact();
        core.spawnRing(this.x, this.groundY, this.splash, this.glow);
        core.spawnParticles(this.x, this.groundY, this.color, 14, 90);
        core.shake(0.22);
        for (const e of enemies) {
          if (e.dead || e.reachedEnd) continue;
          const d = Math.hypot(e.x - this.x, e.y - this.groundY);
          if (d <= this.splash) e.takeDamage(this.damage * (d > this.splash * 0.55 ? 0.55 : 1));
        }
      } else {
        audio.engineerImpact();
        core.spawnParticles(this.x, this.y, this.glow, 5, 60);
        if (this.target && !this.target.dead) this.target.takeDamage(this.damage);
      }
    }
    draw(ctx) {
      if (this.kind === 'lob') {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(this.x, this.groundY, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.shadowColor = this.glow; ctx.shadowBlur = 16;
        const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 8);
        g.addColorStop(0, '#fff6d8'); g.addColorStop(0.5, this.glow); g.addColorStop(1, this.color);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(this.x, this.y, 6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        return;
      }
      ctx.save();
      for (let i = 0; i < this.trail.length; i++) {
        const p = this.trail[i];
        ctx.globalAlpha = (i / this.trail.length) * 0.35;
        ctx.fillStyle = this.glow;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const ang = Math.atan2(
        this.target && !this.target.dead ? this.target.y - this.y : 0,
        this.target && !this.target.dead ? this.target.x - this.x : 1
      );
      ctx.translate(this.x, this.y);
      ctx.rotate(ang);
      ctx.shadowColor = this.glow; ctx.shadowBlur = 14;
      const grad = ctx.createLinearGradient(-10, 0, 6, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(1, '#ffffff');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(8, 0); ctx.lineTo(-10, -3); ctx.lineTo(-6, 0); ctx.lineTo(-10, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ----------------------------------------------------------------- Tower --
  // A "Tower" here is a hired teammate. `damage`/`fireRate` getters compose
  // rank multipliers with the EM aura bonus (read live from Core, see below),
  // a run-wide perk multiplier, and — for fireRate only — the Tech Debt tax.
  const SKIN_TONES = ['#e8b98a', '#c68642', '#8d5524', '#ffdbac', '#f1c27d'];
  const HAIR_COLORS = ['#3a2a1c', '#1c1c1c', '#6b4423', '#c9a876', '#8b3a3a', '#4a4a4a'];

  class Tower {
    constructor(type, col, row, center) {
      const def = CFG.TOWER_TYPES[type];
      this.type = type; this.def = def; this.col = col; this.row = row;
      this.x = center.x; this.y = center.y;
      this.level = 1;
      this.baseRange = def.range; this.baseDamage = def.damage; this.baseFireRate = def.fireRate;
      this.cooldownTimer = 0; this.angle = -Math.PI / 2; this.incomeTimer = 0;
      this.stunTimer = 0;
      // Deterministic per-hire look — same placement always looks the same,
      // but different teammates of the same role aren't visual clones.
      const seed = (col * 7 + row * 13 + type.length * 31) % 997;
      this.skinTone = SKIN_TONES[seed % SKIN_TONES.length];
      this.hairColor = HAIR_COLORS[Math.floor(seed / 5) % HAIR_COLORS.length];
      this.swayPhase = (seed % 628) / 100; // per-tower offset so idle sways don't sync up
    }
    get mult() { return CFG.UPGRADE_MULT[this.level]; }
    get rank() { return this.def.ranks[this.level - 1]; }
    get range() { return this.baseRange * this.mult.range; }
    get damage() {
      const core = window.Game.Core;
      const auraMult = core ? core.auraDmgMultFor() : 1;
      return this.baseDamage * this.mult.dmg * auraMult;
    }
    get fireRate() {
      const core = window.Game.Core;
      const emMult = core ? core.auraRateMultFor() : 1;
      return this.baseFireRate * this.mult.rate * emMult;
    }
    // An EM's own aura strength — read live by Core.auraDmgMultFor/auraRateMultFor.
    get auraLevelMult() { return CFG.AURA_LEVEL_MULT[this.level]; }
    get auraDmgMultValue() { return 1 + (this.def.auraDmgMult || 0) * this.auraLevelMult; }
    get auraRateMultValue() { return Math.max(0.4, 1 - (this.def.auraRateMult || 0) * this.auraLevelMult); }
    get salary() {
      const core = window.Game.Core;
      const tier = core ? core.waves.tier : 0;
      return Math.round(this.def.salaryBase * CFG.SALARY_MULT[this.level] * (1 + tier * CFG.SALARY_ENDLESS_GROWTH));
    }
    canUpgrade() { return this.level < CFG.MAX_TOWER_LEVEL; }
    upgradeCost() {
      return Math.round(this.def.cost * CFG.UPGRADE_BASE_COST_FACTOR * (this.level + 1));
    }
    upgrade() { if (this.canUpgrade()) this.level++; }

    findTarget(enemies) {
      let best = null, bestProgress = -1;
      for (const e of enemies) {
        if (e.dead || e.reachedEnd) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d <= this.range && e.wpIndex > bestProgress) { bestProgress = e.wpIndex; best = e; }
      }
      return best;
    }
    findChainTarget(primary, enemies) {
      let best = null, bestDist = this.def.chainRange;
      for (const e of enemies) {
        if (e === primary || e.dead || e.reachedEnd) continue;
        const d = Math.hypot(e.x - primary.x, e.y - primary.y);
        if (d <= bestDist) { bestDist = d; best = e; }
      }
      return best;
    }

    update(dt, enemies, projectiles, effects) {
      if (this.stunTimer > 0) {
        this.stunTimer -= dt * 1000;
        if (this.stunTimer < 0) this.stunTimer = 0;
        return; // firefighting mode: no firing, no income, while stunned
      }
      if (this.def.attack === 'aura') return; // passive — bonuses are read live by other towers

      if (this.def.income) {
        const core = window.Game.Core;
        const interval = this.def.interval * this.mult.rate;
        this.incomeTimer += dt * 1000;
        if (this.incomeTimer >= interval) {
          this.incomeTimer -= interval;
          const amount = Math.round(this.def.income * this.mult.dmg);
          core.addBudget(amount, this.x, this.y - 26);
          core.spawnParticles(this.x, this.y - 10, this.def.glow, 4, 40);
          effects.push({ type: 'floatText', x: this.x, y: this.y - 50, life: 1.1, maxLife: 1.1, text: '+' + window.Game.fmt(amount), color: '#5fe37f' });
        }
        return;
      }

      this.cooldownTimer -= dt * 1000;
      const target = this.findTarget(enemies);
      if (target) this.angle = Math.atan2(target.y - this.y, target.x - this.x);
      if (!target || this.cooldownTimer > 0) return;
      this.cooldownTimer = this.fireRate;

      if (this.def.attack === 'lightning') {
        window.Game.Audio.qaShoot();
        target.takeDamage(this.damage);
        target.applySlow(this.def.slow, this.def.slowDuration);
        effects.push({ type: 'lightning', life: 0.16, maxLife: 0.16, points: jaggedPoints(this.x, this.y - 46, target.x, target.y, 6, 14), color: this.def.core, glow: this.def.glow });
        effects.push({ type: 'flash', life: 0.18, maxLife: 0.18, x: target.x, y: target.y, r: 16, color: this.def.glow });
        const chain = this.findChainTarget(target, enemies);
        if (chain) {
          const dmg = this.damage * this.def.chainFalloff;
          chain.takeDamage(dmg);
          chain.applySlow(this.def.slow * 0.7, this.def.slowDuration * 0.7);
          effects.push({ type: 'lightning', life: 0.16, maxLife: 0.16, points: jaggedPoints(target.x, target.y, chain.x, chain.y, 5, 12), color: this.def.core, glow: this.def.glow });
          effects.push({ type: 'flash', life: 0.18, maxLife: 0.18, x: chain.x, y: chain.y, r: 12, color: this.def.glow });
        }
        return;
      }

      if (this.def.attack === 'lob') {
        window.Game.Audio.sreShoot();
        const flightTime = Math.hypot(target.x - this.x, target.y - this.y) / this.def.projectileSpeed;
        const dirTarget = target.waypoints[target.wpIndex + 1];
        let px = target.x, py = target.y;
        if (dirTarget) {
          const dx = dirTarget.x - target.x, dy = dirTarget.y - target.y;
          const d = Math.hypot(dx, dy) || 1;
          px += (dx / d) * target.effectiveSpeed * flightTime;
          py += (dy / d) * target.effectiveSpeed * flightTime;
        }
        projectiles.push(new Projectile({
          kind: 'lob', x: this.x, y: this.y - 40, targetX: px, targetY: py,
          speed: this.def.projectileSpeed, damage: this.damage, splash: this.def.splash,
          color: this.def.color, glow: this.def.glow
        }));
        return;
      }

      window.Game.Audio.engineerShoot();
      projectiles.push(new Projectile({
        kind: 'bolt', x: this.x, y: this.y - 40, target,
        speed: this.def.projectileSpeed, damage: this.damage,
        color: this.def.color, glow: this.def.glow
      }));
    }

    draw(ctx) {
      const stunned = this.stunTimer > 0;
      if (stunned) { ctx.save(); ctx.filter = 'grayscale(1) brightness(0.65)'; }

      const t = window.Game.Core.gameTime; // frozen while paused
      const def = this.def;
      const scale = (1 + (this.level - 1) * 0.14) * (this.hovered ? 1.08 : 1);
      const charge = this.cooldownTimer > 0 && this.cooldownTimer < 260 && !def.income && def.attack !== 'aura' ? (260 - this.cooldownTimer) / 260 : 0;

      ctx.save();
      ctx.translate(this.x, this.y);

      if (this.hovered) {
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(0, 8, 27 * scale, 12 * scale, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath(); ctx.ellipse(0, 16, 22 * scale, 8 * scale, 0, 0, Math.PI * 2); ctx.fill();

      ctx.save();
      ctx.rotate(t * 0.5);
      ctx.strokeStyle = def.glow;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, 8, 20 * scale, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      const platGrad = ctx.createRadialGradient(0, 8, 1, 0, 8, 20 * scale);
      platGrad.addColorStop(0, def.glow + 'aa');
      platGrad.addColorStop(1, def.glow + '00');
      ctx.fillStyle = platGrad;
      ctx.beginPath(); ctx.ellipse(0, 8, 20 * scale, 8 * scale, 0, 0, Math.PI * 2); ctx.fill();

      ctx.scale(scale, scale);

      // Gentle idle sway so seated/standing teammates don't look frozen —
      // rotated around the feet (y=14), not the tower's own center, so it
      // reads as swaying rather than tipping over. Skipped for the coffee
      // machine — it's an appliance, not a person.
      if (def.attack !== 'aura') {
        const sway = Math.sin(t * 0.5 + this.swayPhase) * 0.035;
        ctx.translate(0, 14);
        ctx.rotate(sway);
        ctx.translate(0, -14);
      }

      if (!this.drawSpriteBody(ctx)) {
        if (this.type === 'engineer') this.drawEngineer(ctx, t, charge);
        else if (this.type === 'sre') this.drawSre(ctx, t, charge);
        else if (this.type === 'qa') this.drawQa(ctx, t, charge);
        else if (this.type === 'pm') this.drawPm(ctx, t);
        else this.drawCoffeeMachine(ctx, t);
      }

      ctx.restore();

      ctx.save();
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = def.glow;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 3;
      ctx.fillText(this.rank, this.x, this.y + 30);
      ctx.font = '9px sans-serif';
      ctx.fillText('●'.repeat(this.level) + '○'.repeat(CFG.MAX_TOWER_LEVEL - this.level), this.x, this.y + 41);
      ctx.restore();

      if (stunned) {
        ctx.restore();
        ctx.save();
        ctx.translate(this.x, this.y - 58);
        ctx.shadowColor = '#ffcf4d'; ctx.shadowBlur = 10;
        const flameLayer = (scale, colorA, colorB) => {
          const w = 5 * scale, h = 11 * scale;
          ctx.beginPath();
          ctx.moveTo(0, h * 0.5);
          ctx.quadraticCurveTo(-w, -h * 0.1, -w * 0.2, -h * 0.75);
          ctx.quadraticCurveTo(0, -h * 1.05, w * 0.2, -h * 0.75);
          ctx.quadraticCurveTo(w, -h * 0.1, 0, h * 0.5);
          ctx.closePath();
          const g = ctx.createLinearGradient(0, h * 0.5, 0, -h);
          g.addColorStop(0, colorA); g.addColorStop(1, colorB);
          ctx.fillStyle = g;
          ctx.fill();
        };
        flameLayer(1, '#c23a1e', '#ff7a2e');
        flameLayer(0.6, '#ff8a2e', '#ffe27a');
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    // Real generated art, when available — tries the exact-rank sprite first
    // (e.g. "character_sre_3"), falls back to the role's base sprite (e.g.
    // "character_sre", used for level 1 and for any role whose rank art
    // isn't generated yet), drawn anchored bottom-center at the same ground
    // point (y=14) the procedural figures below stand on so switching art
    // on/off never shifts anyone's footing. Returns false if nothing is
    // loaded, so the caller falls back to the procedural shape.
    drawSpriteBody(ctx) {
      const Assets = window.Game.Assets;
      const img = Assets.get('character_' + this.type + '_' + this.level) || Assets.get('character_' + this.type);
      if (!img) return false;
      const targetH = 96;
      const rw = targetH * (img.naturalWidth / img.naturalHeight);
      ctx.drawImage(img, -rw / 2, 14 - targetH, rw, targetH);
      return true;
    }

    // Four of the five roles render as an actual person at a desk/station;
    // the coffee machine is deliberately the odd one out — an office
    // appliance, not a teammate. (Procedural fallback, used only until/unless
    // a role's sprite is unavailable.)
    drawEngineer(ctx, t, charge) {
      const def = this.def;
      // desk
      const deskGrad = ctx.createLinearGradient(0, -6, 0, 14);
      deskGrad.addColorStop(0, '#a98559'); deskGrad.addColorStop(1, '#6b4f30');
      ctx.fillStyle = deskGrad;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-19, -6, 38, 16, 3); else ctx.rect(-19, -6, 38, 16);
      ctx.fill();
      ctx.fillStyle = '#4a3720';
      ctx.fillRect(-16, 10, 3, 6); ctx.fillRect(13, 10, 3, 6);

      // laptop
      ctx.fillStyle = '#e7ecf3';
      ctx.beginPath(); ctx.moveTo(-11, -6); ctx.lineTo(11, -6); ctx.lineTo(9, -9); ctx.lineTo(-9, -9); ctx.closePath(); ctx.fill();
      const screenGrad = ctx.createLinearGradient(0, -30, 0, -9);
      screenGrad.addColorStop(0, '#dff0ff'); screenGrad.addColorStop(1, def.color);
      ctx.shadowColor = def.glow; ctx.shadowBlur = 8 + charge * 10;
      ctx.fillStyle = screenGrad;
      ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(9, -9); ctx.lineTo(8, -27); ctx.lineTo(-8, -27); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let i = 0; i < 3; i++) ctx.fillRect(-6, -24 + i * 5, 8 + (i % 2) * 3, 1.6);
      if (Math.sin(t * 4) > 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(-6 + (Math.sin(t * 1.3) + 1) * 4, -24, 1.4, 3.5); }

      // torso (hoodie) sitting behind the desk
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.moveTo(-11, -6); ctx.quadraticCurveTo(-13, -30, 0, -32); ctx.quadraticCurveTo(13, -30, 11, -6);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-7, -9); ctx.lineTo(-3, -13); ctx.lineTo(3, -13); ctx.lineTo(7, -9); ctx.stroke();
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.ellipse(0, -30, 9, 6, 0, Math.PI, 0); ctx.fill();

      // head
      ctx.fillStyle = this.skinTone;
      ctx.beginPath(); ctx.arc(0, -38, 7.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = this.hairColor;
      ctx.beginPath(); ctx.arc(0, -42, 7.6, Math.PI, 0); ctx.fill();
      ctx.fillStyle = 'rgba(20,20,25,0.85)';
      ctx.beginPath(); ctx.arc(-2.6, -38, 1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(2.6, -38, 1, 0, Math.PI * 2); ctx.fill();
    }

    drawSre(ctx, t, charge) {
      const def = this.def;
      // small server cart beside them
      ctx.fillStyle = '#5c4630';
      ctx.fillRect(8, -20, 14, 26);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.strokeRect(8, -20, 14, 26);
      for (let i = 0; i < 3; i++) {
        const on = Math.sin(t * 3 + i * 1.3) > 0;
        ctx.fillStyle = on ? '#ffcf8a' : '#7a5c3a';
        if (on) { ctx.shadowColor = def.glow; ctx.shadowBlur = 5; }
        ctx.fillRect(11, -16 + i * 7, 8, 2.4);
        ctx.shadowBlur = 0;
      }

      // legs (standing, work pants)
      ctx.fillStyle = '#3a3f4a';
      ctx.fillRect(-8, -4, 6, 18); ctx.fillRect(2, -4, 6, 18);
      // torso (hi-vis vest)
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.moveTo(-9, -4); ctx.quadraticCurveTo(-11, -28, 0, -30); ctx.quadraticCurveTo(11, -28, 9, -4);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-4, -27); ctx.lineTo(-4, -8); ctx.moveTo(4, -27); ctx.lineTo(4, -8); ctx.stroke();

      // head + hard hat
      ctx.fillStyle = this.skinTone;
      ctx.beginPath(); ctx.arc(0, -36, 7.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.arc(0, -38, 7.8, Math.PI, 0); ctx.fill();
      ctx.fillRect(-8, -38, 16, 2);
      ctx.fillStyle = 'rgba(20,20,25,0.85)';
      ctx.beginPath(); ctx.arc(-2.6, -35, 1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(2.6, -35, 1, 0, Math.PI * 2); ctx.fill();

      // rotating "rollback" gadget signal above their head
      ctx.save();
      ctx.translate(0, -52);
      ctx.rotate(t * 1.6);
      const rr = 6 + charge * 6;
      ctx.shadowColor = '#ff9d3d'; ctx.shadowBlur = 14 + charge * 10;
      ctx.strokeStyle = def.color; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(0, 0, rr, 0.4, Math.PI * 1.8); ctx.stroke();
      ctx.fillStyle = def.core;
      const hx = rr * Math.cos(0.4), hy = rr * Math.sin(0.4);
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - 3, hy - 4); ctx.lineTo(hx + 3.4, hy - 2); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    drawQa(ctx, t, charge) {
      const def = this.def;
      // legs
      ctx.fillStyle = '#2a4a44';
      ctx.fillRect(-7, -4, 6, 18); ctx.fillRect(1, -4, 6, 18);
      // torso (button shirt)
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.moveTo(-9, -4); ctx.quadraticCurveTo(-11, -28, 0, -30); ctx.quadraticCurveTo(11, -28, 9, -4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#eafffb';
      ctx.beginPath(); ctx.moveTo(-3, -27); ctx.lineTo(0, -22); ctx.lineTo(3, -27); ctx.closePath(); ctx.fill();

      // clipboard held out front
      ctx.save();
      ctx.translate(9, -14);
      ctx.rotate(-0.15);
      ctx.fillStyle = '#e9e2d0';
      ctx.fillRect(-5, -8, 10, 14);
      ctx.fillStyle = '#c7bfa8'; ctx.fillRect(-2.5, -10, 5, 3);
      ctx.strokeStyle = 'rgba(20,60,50,0.5)'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-3, -4 + i * 4); ctx.lineTo(3, -4 + i * 4); ctx.stroke(); }
      ctx.restore();

      // head + glasses
      ctx.fillStyle = this.skinTone;
      ctx.beginPath(); ctx.arc(0, -36, 7.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = this.hairColor;
      ctx.beginPath(); ctx.arc(0, -40, 7.6, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(20,20,25,0.75)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(-2.6, -35.5, 2, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(2.6, -35.5, 2, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.6, -35.5); ctx.lineTo(0.6, -35.5); ctx.stroke();

      // orbiting checkmarks — the "test run" signal
      for (let i = 0; i < 3; i++) {
        const a = t * 1.4 + (i / 3) * Math.PI * 2;
        const ox = Math.cos(a) * 15, oy = -48 + Math.sin(a) * 5;
        ctx.shadowColor = def.glow; ctx.shadowBlur = 8;
        ctx.strokeStyle = 'rgba(220,255,250,0.9)'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(ox - 2.5, oy); ctx.lineTo(ox - 0.5, oy + 2.2); ctx.lineTo(ox + 3, oy - 2.6); ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    drawPm(ctx, t) {
      const def = this.def;
      // legs
      ctx.fillStyle = '#3a3540';
      ctx.fillRect(-7, -4, 6, 18); ctx.fillRect(1, -4, 6, 18);
      // torso (blazer)
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.moveTo(-10, -4); ctx.quadraticCurveTo(-12, -29, 0, -31); ctx.quadraticCurveTo(12, -29, 10, -4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff8dc';
      ctx.beginPath(); ctx.moveTo(-3, -28); ctx.lineTo(0, -23); ctx.lineTo(3, -28); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#b8892a'; ctx.fillRect(-1, -23, 2, 10);

      // chart board held to the side
      ctx.save();
      ctx.translate(-11, -16);
      ctx.rotate(0.1);
      ctx.fillStyle = '#fefaf0';
      ctx.fillRect(-6, -9, 12, 14);
      ctx.strokeStyle = '#caa23a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-4, 3); ctx.lineTo(-1, -2); ctx.lineTo(2, 0); ctx.lineTo(5, -6); ctx.stroke();
      ctx.restore();

      // head
      ctx.fillStyle = this.skinTone;
      ctx.beginPath(); ctx.arc(0, -37, 7.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = this.hairColor;
      ctx.beginPath(); ctx.arc(0, -41, 7.6, Math.PI, 0); ctx.fill();
      ctx.fillStyle = 'rgba(20,20,25,0.85)';
      ctx.beginPath(); ctx.arc(-2.6, -36.5, 1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(2.6, -36.5, 1, 0, Math.PI * 2); ctx.fill();

      // rising $ glyphs — the income signal
      ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
      for (let i = 0; i < 2; i++) {
        const phase = t * 1.2 + i * Math.PI;
        const yy = -48 - ((t * 14 + i * 20) % 26);
        ctx.globalAlpha = Math.max(0, 1 - Math.abs(yy + 15) / 15);
        ctx.fillStyle = def.core;
        ctx.shadowColor = def.glow; ctx.shadowBlur = 6;
        ctx.fillText('$', Math.sin(phase) * 8, yy);
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    }

    // The aura booster is deliberately not a person — it's the office coffee
    // machine everyone gets a productivity bump from being near.
    drawCoffeeMachine(ctx, t) {
      const def = this.def;
      ctx.fillStyle = '#2c2a28';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-14, -44, 28, 50, 3); else ctx.rect(-14, -44, 28, 50);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.2;
      ctx.strokeRect(-14, -44, 28, 50);

      ctx.fillStyle = '#3d3a36';
      ctx.fillRect(-11, -42, 22, 10);
      ctx.fillStyle = '#1a1816';
      ctx.fillRect(-3, -30, 6, 6);

      const pulse = 0.6 + Math.sin(t * 2.2) * 0.4;
      ctx.shadowColor = def.glow; ctx.shadowBlur = 10 * pulse;
      ctx.fillStyle = def.glow;
      ctx.beginPath(); ctx.arc(0, -36, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#c9832e'; ctx.beginPath(); ctx.arc(-7, -20, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5aa66b'; ctx.beginPath(); ctx.arc(0, -20, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c94b4b'; ctx.beginPath(); ctx.arc(7, -20, 2, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#eef0f4';
      ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(6, -2); ctx.lineTo(4.5, 8); ctx.lineTo(-4.5, 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4a2c17';
      ctx.beginPath(); ctx.ellipse(0, -1.5, 5.5, 1.6, 0, 0, Math.PI * 2); ctx.fill();

      const dripPhase = t % 1.4;
      if (dripPhase < 0.7) {
        ctx.fillStyle = '#5a3520';
        ctx.beginPath(); ctx.arc(0, -24 + (dripPhase / 0.7) * 22, 1.6, 0, Math.PI * 2); ctx.fill();
      }

      for (let i = 0; i < 2; i++) {
        const phase = t * 1.3 + i * Math.PI;
        const sy = -46 - ((t * 10 + i * 14) % 20);
        ctx.globalAlpha = Math.max(0, 1 - Math.abs(sy + 56) / 16);
        ctx.shadowColor = '#dff'; ctx.shadowBlur = 5;
        ctx.fillStyle = 'rgba(235,245,255,0.75)';
        ctx.beginPath(); ctx.arc(Math.sin(phase) * 3, sy, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;

      ctx.strokeStyle = 'rgba(217,196,255,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, -20, 17, 0, Math.PI * 2); ctx.stroke();
    }
  }

  window.Game.Entities = { Enemy, Projectile, Tower, jaggedPoints, strokeGlowPath };
})();
