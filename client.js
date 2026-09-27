// Client half of the beautify bundle.
//
// v5: adds waifu mode — an assistant avatar, the assistant reply inside bubbles,
// and one bubble per rendered markdown block — behind a toggle in the session
// header, plus a top-bar switch for it.
// v6: adds the water-glass material. Frosted glass and water glass are not the
// same knob: frosted raises the fill opacity until the panel stops being
// see-through, water glass keeps the fill low and buys the look from blur,
// saturation and a rim highlight instead. DSH already ships that material — it
// is what --dsw-menu-backdrop-filter is — so this reuses its tokens and its
// background-layer idiom rather than inventing a second one.
// v7: lets an imported texture join in. Gradients and a photo are not
// alternatives for water: gradients are vector, so they stay correct at every
// bubble size and hold the tint, while a texture carries the mid-surface
// caustics no gradient can express. So a texture is blended in as an extra
// background layer on top, never swapped in for the gradients.
//
// Three mechanisms live here, with different risk:
//   - Theme tokens (--dsw-*) are the supported surface. A renamed token degrades
//     the look but never breaks rendering.
//   - Shipped chat stylesheet class names. They are hashed, so a DSH upgrade can
//     silently retire them; those rules then simply stop applying. Nothing breaks.
//   - localStorage for every user value; it survives restart.
window.__ModuleLoader__.load({
  id: '@local/dsh-beautify',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const SOURCE = '@local/dsh-beautify';
    const STORE_KEY = 'dsh-beautify.settings.v1';

    // Shipped chat stylesheet classes (see the note above about upgrade risk).
    const BUBBLE_CLASS = 'LdtX1G_bubble'; // one user message bubble
    const USER_ROW_CLASS = 'LdtX1G_userRow'; // the user message row
    const AI_ROOT_CLASS = 'kshsua_root'; // the assistant step root
    const AI_BODY_CLASS = 'kshsua_body'; // the assistant markdown column
    // The app frame, the sidebar column and the sidebar root. DSH paints the
    // sidebar fill on the column AND again on the root inside it; the frame
    // carries --dsw-alias-bg-base across the whole window, sidebar included.
    const FRAME_CLASS = 'ZTP-Xa_frame';
    const SIDEBAR_COL_CLASS = 'ZTP-Xa_sidebarCol';
    const SIDEBAR_CLASS = 'n_2Q3W_root';

    const IMAGE_MAX_WIDTH = 1920;
    const AVATAR_MAX_WIDTH = 512;
    const IMAGE_QUALITY = 0.82;
    // A ripple texture is mostly transparent highlight, so it is capped smaller
    // and encoded to webp: the jpeg path the photo slots use would flatten the
    // alpha channel and lose exactly the part that makes it a highlight.
    const TEXTURE_MAX_WIDTH = 1024;
    const TEXTURE_QUALITY = 0.9;

    // The right-bar pane the character card lives in. The id is this
    // implementation's identity in the tab system and the key its body
    // registers under, so the two have to be the same string.
    const CARD_ID = '@local/dsh-beautify/character';
    const CARD_KIND = 'beautify-character';
    const EXPRESSION_MAX_WIDTH = 384;
    const EXPRESSION_QUALITY = 0.85;
    const PORTRAIT_MAX_WIDTH = 700;

    // Their files are already named expr_<mood>.png, so the mood is read off the
    // filename rather than asked for again in a form.
    const EXPRESSION_LABELS = {
      alert: '警觉',
      blissful: '满足',
      cheerful: '开心',
      dazed: '发呆',
      gentle: '温柔',
      pensive: '沉思',
      sad: '难过',
      shy: '害羞',
      sleepy: '困倦',
      smug: '得意',
    };

    const DEFAULTS = {
      // overall
      sidebar: 55,
      mainArea: 0,
      dialog: 97,
      imageOpacity: 70,
      imageBlur: 0,
      image: null,
      // user bubble + avatar
      bubbleColor: '#4d6bfe',
      bubbleOpacity: 100,
      bubbleRadius: 18,
      bubbleBlur: 0,
      avatar: null,
      avatarSize: 34,
      avatarPosition: 'center center',
      // waifu mode
      waifu: false,
      assistantAvatar: null,
      assistantAvatarPosition: 'center center',
      aiBubbleColor: '#8e9bff',
      aiBubbleOpacity: 55,
      splitBubbles: true,
      hugBubbles: true,
      // water-glass material
      glass: false,
      glassBlur: 22,
      glassSaturate: 150,
      glassHighlight: 70,
      glassSheen: 40,
      // optional imported water-ripple texture, laid over the bubbles
      rippleSource: null, // the texture at full alpha, persisted
      rippleOpacity: 55,
      rippleBlur: 4,
      rippleBlend: 'soft-light',
      // How many copies of the texture fit across the positioning area. cover
      // blew the image up to fill the window, which is what made it sparse;
      // tiling it at a fixed fraction of the width is what makes it read as a
      // surface instead of one enormous watermark.
      rippleDensity: 4,
      // true = one sheet shared by the whole window (background-attachment:
      // fixed), false = each bubble gets its own copy of the texture.
      rippleAlign: true,
      rippleSidebar: false,
      glassSidebar: true,
      glassPanel: true,
      glassBubble: true,
      // right-bar character card
      cardName: '',
      cardLine: '',
      cardPortrait: null,
      cardPortraitRatio: 0.75,
      cardPortraitFit: 'contain',
      cardPortraitPos: 'center top',
      cardBg: null,
      cardBgBlur: 0,
      cardColor: '#2b2532',
      cardOpacity: 88,
      cardText: '#f7f1e8',
      cardRadius: 20,
      // [{ key, name, image, ratio }] — the images are the heavy part, so they
      // are downscaled hard on import and the list is kept small.
      expressions: [],
      // the portrait standing on the interface itself, not just in the pane
      float: false,
      floatSize: 260,
      floatOpacity: 100,
      floatCorner: 'bottom right',
      // Screen-space nudge, so the meaning of the sliders does not flip when the
      // corner does: positive x is always right, positive y always down.
      floatOffsetX: 0,
      floatOffsetY: 0,
      floatFlip: false,
    };

    const BACKDROP = {
      dark: [
        'radial-gradient(1100px 700px at 12% 8%, rgba(255,110,170,0.42), transparent 62%)',
        'radial-gradient(900px 620px at 88% 14%, rgba(80,150,255,0.38), transparent 62%)',
        'radial-gradient(1000px 900px at 50% 108%, rgba(140,100,255,0.36), transparent 60%)',
        'linear-gradient(165deg, #12162a 0%, #1b1636 48%, #0e1c2c 100%)',
      ].join(', '),
      light: [
        'radial-gradient(1100px 700px at 12% 8%, rgba(255,170,205,0.55), transparent 62%)',
        'radial-gradient(900px 620px at 88% 14%, rgba(160,200,255,0.50), transparent 62%)',
        'radial-gradient(1000px 900px at 50% 108%, rgba(190,170,255,0.45), transparent 60%)',
        'linear-gradient(165deg, #fdf7fb 0%, #f2f2fb 48%, #eef6fb 100%)',
      ].join(', '),
    };

    function clampPercent(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return 0;
      return Math.min(100, Math.max(0, n)) / 100;
    }

    function clampNumber(value, min, max) {
      const n = Number(value);
      if (!Number.isFinite(n)) return min;
      return Math.min(max, Math.max(min, n));
    }

    function hexToRgb(hex) {
      const raw = String(hex || '').trim().replace(/^#/, '');
      const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
      if (!/^[0-9a-fA-F]{6}$/.test(full)) return { r: 77, g: 107, b: 254 };
      return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16),
      };
    }

    function rgba(hex, alpha) {
      const { r, g, b } = hexToRgb(hex);
      return `rgba(${r},${g},${b},${alpha})`;
    }

    function tokensFor(current) {
      const s = clampPercent(current.sidebar);
      const m = clampPercent(current.mainArea);
      const d = clampPercent(current.dialog);
      const tokens = {
        // The conversation column and the composer both read bg-base, so this one
        // token is the whole main area — it cannot single out the input box.
        '--dsw-alias-bg-base': {
          light: `rgba(255,255,255,${m})`,
          dark: `rgba(20,23,36,${m})`,
        },
        '--dsw-specific-sidebar-fill': {
          light: `rgba(255,255,255,${s})`,
          dark: `rgba(10,12,22,${s})`,
        },
        '--dsw-alias-bg-layer-1': {
          light: `rgba(255,255,255,${d})`,
          dark: `rgba(26,29,44,${d})`,
        },
        '--dsw-alias-bg-layer-2': {
          light: `rgba(255,255,255,${d})`,
          dark: `rgba(30,33,48,${d})`,
        },
        '--dsw-alias-bg-layer-3': {
          light: `rgba(255,255,255,${d})`,
          dark: `rgba(34,38,54,${d})`,
        },
        '--dsw-alias-bg-overlay': {
          light: `rgba(255,255,255,${d})`,
          dark: `rgba(22,25,38,${d})`,
        },
        // The shipped user-bubble background, overridden per scheme with the picked colour.
        '--dsw-specific-bubble': {
          light: rgba(current.bubbleColor, clampPercent(current.bubbleOpacity)),
          dark: rgba(current.bubbleColor, clampPercent(current.bubbleOpacity)),
        },
      };

      if (current.glass) {
        // Menus, popovers and tooltips already carry a backdrop-filter; all they
        // need is the blur/saturation they should use and a fill that lets the
        // backdrop through. Both names are set because MenuSurface reads the
        // generic one while other surfaces read the semantic alias.
        const blur = clampNumber(current.glassBlur, 0, 60);
        const saturate = clampNumber(current.glassSaturate, 100, 260);
        const panelFill = {
          light: `rgba(255,255,255,${d})`,
          dark: `rgba(26,29,44,${d})`,
        };
        const panelFilter = `blur(${blur}px) saturate(${saturate}%)`;
        tokens['--dsw-specific-menu'] = panelFill;
        tokens['--dsw-menu-surface-fill'] = panelFill;
        tokens['--dsw-menu-backdrop-filter'] = { light: panelFilter, dark: panelFilter };
        // The modal mask covers the whole app, so it gets a lighter blur than the
        // panels themselves: same look, a fraction of the per-frame cost.
        tokens['--dsw-mask-blur'] = {
          light: `blur(${Math.round(blur * 0.6)}px)`,
          dark: `blur(${Math.round(blur * 0.6)}px)`,
        };
      }

      return tokens;
    }

    function loadSettings() {
      try {
        const raw = window.localStorage.getItem(STORE_KEY);
        if (!raw) return { ...DEFAULTS };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return { ...DEFAULTS };
        const merged = { ...DEFAULTS, ...parsed };
        // One-time nudge: the untouched old default becomes the colour the plugin
        // author picked, without disturbing anything the user chose themselves.
        if (merged.aiBubbleColor === '#ffffff') merged.aiBubbleColor = DEFAULTS.aiBubbleColor;
        return merged;
      } catch (error) {
        return { ...DEFAULTS };
      }
    }

    let settings = loadSettings();
    let disposeLayer = null;
    let rippleTimer = null;
    const listeners = new Set();

    function notify() {
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch (error) {
          console.error('[dsh-beautify] listener failed', error);
        }
      }
    }

    function persist() {
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(settings));
        return true;
      } catch (error) {
        console.error('[dsh-beautify] persist failed', error);
        return false;
      }
    }

    function updateSettings(patch) {
      settings = { ...settings, ...patch };
      const ok = persist();
      if ('rippleSource' in patch || 'rippleOpacity' in patch || 'rippleBlur' in patch) {
        scheduleRipple(settings.rippleSource, settings.rippleOpacity, settings.rippleBlur);
      }
      notify();
      return ok;
    }

    // The ripple is stored once at full alpha and re-baked at the chosen
    // strength into this cache. Keeping the baked copy out of settings halves
    // what lands in localStorage, which matters because a texture is a data URL.
    let rippleCache = { key: null, baked: null };

    function scheduleRipple(source, opacity, blur) {
      if (rippleTimer) {
        clearTimeout(rippleTimer);
        rippleTimer = null;
      }
      if (!source) {
        rippleCache = { key: null, baked: null };
        return;
      }
      const key = `${opacity}|${blur}`;
      if (rippleCache.key === key && rippleCache.source === source) return;
      rippleTimer = setTimeout(() => {
        rippleTimer = null;
        loadImageElement(source)
          .then((image) => {
            rippleCache = { key, source, baked: bakeTexture(image, opacity, blur) };
            notify();
          })
          .catch((error) => console.error('[dsh-beautify] ripple bake failed', error));
      }, 120);
    }

    function cssFor(scheme, current) {
      const imgBlur = clampNumber(current.imageBlur, 0, 60);
      const imageOpacity = clampPercent(current.imageOpacity);
      const radius = clampNumber(current.bubbleRadius, 0, 40);
      const bubbleBlur = clampNumber(current.bubbleBlur, 0, 40);
      const avatarSize = clampNumber(current.avatarSize, 16, 96);

      const glassOn = !!current.glass;
      const gBlur = clampNumber(current.glassBlur, 0, 60);
      const gSaturate = clampNumber(current.glassSaturate, 100, 260);
      // A white rim is the whole difference between "translucent rectangle" and
      // "glass", so it is its own knob. Dark surfaces need roughly half of it to
      // read the same, because the fill behind it is already dark.
      const gHighlight = clampNumber(current.glassHighlight, 0, 100) / 100;
      const rimFactor = scheme === 'dark' ? 0.5 : 1;
      const rimStrong = `rgba(255,255,255,${(gHighlight * rimFactor).toFixed(3)})`;
      const rimSoft = `rgba(255,255,255,${(gHighlight * rimFactor * 0.42).toFixed(3)})`;
      // Three layers rather than one hairline: a bright edge, a short glow that
      // bleeds down from it, and a 1px outline. A single 1px inset reads as a
      // rendering artefact at 15% strength; this reads as an edge.
      const rimEdge = `inset 0 1.5px 0 ${rimStrong}`;
      const rimGlow = `inset 0 9px 14px -10px ${rimStrong}`;
      const rimLine = `inset 0 0 0 1px ${rimSoft}`;
      const rimAll = `${rimEdge},${rimGlow},${rimLine}`;

      // Water, unlike tinted plastic, is not a flat fill: light gathers into a
      // band along the top edge, pools a little where the surface curves away,
      // and bounces off the far edge. The stops are in px, not %, so a one-line
      // bubble and a ten-line one get the same edge rather than a gradient that
      // scales with the paragraph.
      //
      // The middle is left untouched on purpose. That is the part you see
      // through, and washing it in white is precisely what turns water into
      // milk — which is what the first attempt did.
      const gSheen = clampNumber(current.glassSheen, 0, 100) / 100;
      const sheenOn = glassOn && current.glassBubble && gSheen > 0;
      const sheenWhite = (a) => `rgba(255,255,255,${(a * (scheme === 'dark' ? 0.45 : 1)).toFixed(3)})`;

      // Gradients give the edge, a photo gives the surface. They are not
      // alternatives: the gradients are vector, so they stay correct at every
      // bubble size and keep the tint; a texture carries the mid-surface
      // caustics that no gradient can express. So an imported texture is laid
      // on top as an extra layer and blended, never swapped in.
      const layers = [];
      const sizes = [];
      const repeats = [];
      const blends = [];
      const attachments = [];

      const rippleDensity = Math.round(clampNumber(current.rippleDensity, 1, 12));

      const rippleOn = glassOn && current.glassBubble && !!rippleCache.baked;
      if (rippleOn) {
        layers.push(`url("${rippleCache.baked}")`);
        // A percentage size resolves against the positioning area, which fixed
        // attachment makes the viewport and scroll attachment makes the bubble.
        // Either way the slider means "this many tiles across".
        sizes.push(`calc(100% / ${rippleDensity}) auto`);
        repeats.push('repeat');
        blends.push(current.rippleBlend);
        // pinned to the viewport, so every bubble shows its own slice of one
        // continuous sheet rather than a complete copy of the texture. That is
        // the difference between a water surface and a row of tiles.
        attachments.push(current.rippleAlign ? 'fixed' : 'scroll');
      }

      if (sheenOn) {
        layers.push(
          `linear-gradient(180deg,${sheenWhite(gSheen)} 0,${sheenWhite(0)} 20px)`,
          `radial-gradient(40% 36px at 9% 0%,${sheenWhite(gSheen * 0.7)} 0,${sheenWhite(0)} 100%)`,
          `linear-gradient(0deg,${sheenWhite(gSheen * 0.35)} 0,${sheenWhite(0)} 14px)`,
        );
        sizes.push('auto', 'auto', 'auto');
        repeats.push('no-repeat', 'no-repeat', 'no-repeat');
        blends.push('normal', 'normal', 'normal');
        attachments.push('scroll', 'scroll', 'scroll');
      }

      // background-blend-mode is what makes a texture modulate the bubble rather
      // than cover it, so the picked blend mode is the strength control: soft
      // light barely touches the hue, overlay pushes it, luminosity throws the
      // texture's own colour away and keeps only its shading.
      const bubbleLayers = layers.length
        ? `background-image:${layers.join(',')} !important;` +
          `background-size:${sizes.join(',')} !important;` +
          `background-repeat:${repeats.join(',')} !important;` +
          `background-attachment:${attachments.join(',')} !important;` +
          `background-blend-mode:${blends.join(',')} !important;`
        : '';

      let out = `html{background:${BACKDROP[scheme]};background-attachment:fixed;}`;

      if (current.image) {
        // html::before paints above html's own background and below body content,
        // which is exactly the seat a backdrop image needs.
        out +=
          `html::before{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;` +
          `background-image:url("${current.image}");background-size:cover;background-position:center;` +
          `opacity:${imageOpacity};` +
          (imgBlur > 0 ? `filter:blur(${imgBlur}px);transform:scale(${1 + imgBlur / 200});` : '') +
          `}`;
      }

      // Backdrop filter for the bubbles. Water glass needs the saturation leg even
      // when the blur is switched off, so the two are assembled separately.
      const bubbleFilter = [];
      if (bubbleBlur > 0) bubbleFilter.push(`blur(${bubbleBlur}px)`);
      if (glassOn && current.glassBubble) bubbleFilter.push(`saturate(${gSaturate}%)`);
      const glass = bubbleFilter.length
        ? `backdrop-filter:${bubbleFilter.join(' ')};-webkit-backdrop-filter:${bubbleFilter.join(' ')};`
        : '';
      const bubbleRim =
        glassOn && current.glassBubble ? `box-shadow:${rimAll};` : '';

      // --dsw-specific-bubble already carries the user colour, so this rule only
      // adds what a token cannot express: geometry and a backdrop filter.
      out += `.${BUBBLE_CLASS}{border-radius:${radius}px !important;${glass}${bubbleLayers}${bubbleRim}}`;

      if (current.avatar) {
        // The row is a right-aligned column by default; flipping it to a row makes
        // space for a trailing avatar without touching the shipped component.
        out +=
          `.${USER_ROW_CLASS}{flex-direction:row !important;align-items:flex-start !important;` +
          `justify-content:flex-end !important;gap:10px !important;}` +
          `.${USER_ROW_CLASS}::after{content:'';flex:none;align-self:flex-start;` +
          `width:${avatarSize}px;height:${avatarSize}px;border-radius:50%;` +
          `background-image:url("${current.avatar}");background-size:cover;` +
          `background-position:${current.avatarPosition};` +
          `box-shadow:0 0 0 1px var(--dsw-alias-border-l2);}`;
      }

      if (current.waifu) {
        const aiBg = rgba(current.aiBubbleColor, clampPercent(current.aiBubbleOpacity));

        // Grid, not flex: the avatar takes column 1 spanning every row while the
        // shipped children stack in column 2, which a flex row would flatten.
        if (current.assistantAvatar) {
          out +=
            `.${AI_ROOT_CLASS}{display:grid !important;grid-template-columns:auto minmax(0,1fr);` +
            `column-gap:10px;}` +
            `.${AI_ROOT_CLASS}::before{content:'';grid-column:1;grid-row:1 / -1;align-self:start;` +
            `width:${avatarSize}px;height:${avatarSize}px;border-radius:50%;` +
            `background-image:url("${current.assistantAvatar}");background-size:cover;` +
            `background-position:${current.assistantAvatarPosition};` +
            `box-shadow:0 0 0 1px var(--dsw-alias-border-l2);}` +
            `.${AI_ROOT_CLASS} > *{grid-column:2;min-width:0;}`;
        }

        if (current.splitBubbles) {
          // The markdown column's own children are wrappers, not blocks, so style the
          // rendered blocks themselves: one box per paragraph, per code block, per
          // quote, per list, per heading. A single-paragraph reply is one block and
          // therefore one bubble, which is the wanted behaviour rather than a special case.
          // The :not() guard keeps it to one box per top-level block — a paragraph
          // inside a quote or a list item must not draw a second box in its parent's.
          const blocks =
            `.${AI_BODY_CLASS} :is(p,pre,blockquote,ul,ol,h1,h2,h3,h4,h5,h6,table)` +
            `:not(:is(blockquote,li,td,th) *)`;
          out +=
            `${blocks}{background-color:${aiBg} !important;border-radius:${radius}px !important;` +
            `padding:8px 14px !important;${glass}${bubbleLayers}${bubbleRim}}`;

          if (current.hugBubbles) {
            // A block fills its container by default, so every bubble would be the full
            // column width. fit-content makes a short block hug its own text while
            // max-width still wraps a long one. Code blocks and tables keep the full
            // width, which is what those two want anyway.
            const hugging =
              `.${AI_BODY_CLASS} :is(p,blockquote,ul,ol,h1,h2,h3,h4,h5,h6)` +
              `:not(:is(blockquote,li,td,th) *)`;
            out += `${hugging}{width:fit-content !important;max-width:100% !important;}`;
          }
        } else {
          out +=
            `.${AI_BODY_CLASS}{background-color:${aiBg} !important;border-radius:${radius}px !important;` +
            `padding:10px 16px !important;${glass}${bubbleLayers}${bubbleRim}}`;
        }
      }

      const sidebarGlass = glassOn && current.glassSidebar;
      const sidebarRipple = glassOn && current.rippleSidebar && !!rippleCache.baked;

      if (sidebarGlass) {
        // DSH already ships this exact material for macOS, where the native
        // window supplies the blur: the frame gives up its wash
        // (.ZTP-Xa_frame{background:0 0}), the sidebar column paints a blue
        // sheen over a tinted fill cut to 40%, and the sidebar root inside it
        // zeroes its own duplicate fill. Windows has no native material, so the
        // same recipe runs here with a backdrop layer added underneath.
        //
        // The frame is the important half of the fix. It carries
        // --dsw-alias-bg-base across the whole window, sidebar included, so
        // without this the backdrop layer would blur an opaque sheet into flat
        // milk — which is exactly what frosted glass is, and not what was asked
        // for. The centre column repaints its own base, so nothing else moves.
        out +=
          `.${FRAME_CLASS}{background:transparent !important;}` +
          `.${SIDEBAR_CLASS}{background:transparent !important;}` +
          `.${SIDEBAR_COL_CLASS}{` +
          `background:linear-gradient(to bottom,rgba(122,155,240,.10),rgba(122,155,240,0) 35%,` +
          `rgba(143,137,184,0) 68%,rgba(143,137,184,.09)),` +
          `color-mix(in srgb,color-mix(in srgb,var(--dsw-specific-sidebar-fill) 97%,#7a9bf0) 40%,transparent) !important;` +
          `border-right:none !important;}`;
      }

      if (sidebarGlass || sidebarRipple) {
        // One background layer carries both the blur and the ripple. A pseudo
        // element rather than the column itself: a backdrop-filter on the column
        // would turn it into the containing block for the fixed-position
        // titlebar buttons inside. The layer has no fill of its own — the column
        // already paints that, so this only filters and textures what is behind.
        out +=
          `.${SIDEBAR_COL_CLASS}{position:relative;isolation:isolate;}` +
          `.${SIDEBAR_COL_CLASS}::before{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;` +
          (sidebarGlass
            ? `backdrop-filter:blur(${gBlur}px) saturate(${gSaturate}%);` +
              `-webkit-backdrop-filter:blur(${gBlur}px) saturate(${gSaturate}%);`
            : '') +
          (sidebarRipple
            ? `background-image:url("${rippleCache.baked}");` +
              `background-size:calc(100% / ${rippleDensity}) auto;background-repeat:repeat;` +
              `background-position:0 0;background-attachment:${current.rippleAlign ? 'fixed' : 'scroll'};`
            : '') +
          (sidebarGlass ? `box-shadow:${rimEdge},${rimGlow},inset -1.5px 0 0 ${rimSoft};` : '') +
          `}`;
      }

      if (glassOn && current.glassPanel) {
        // Every floating surface composes its shadow from --dsw-elevation-stroke,
        // so one custom property puts the rim on all of them — menus, popovers,
        // tooltips and the settings dialog — without naming a single class.
        // html body * outranks the shipped "body, body *" declaration on
        // specificity, so no !important is needed.
        out +=
          `html body,html body *{--dsw-elevation-stroke:0 0 0 .5px var(--dsw-elevation-stroke-color),` +
          `${rimEdge},inset 0 8px 14px -12px ${rimStrong};}`;
      }

      return out;
    }

    function readScheme(ctx) {
      const snapshot = ctx.theme.getTheme();
      const scheme = snapshot && snapshot.active ? snapshot.active.colorScheme : 'dark';
      return scheme === 'light' ? 'light' : 'dark';
    }

    function useSettings() {
      const [, force] = React.useState(0);
      React.useEffect(() => {
        const listener = () => force((n) => n + 1);
        listeners.add(listener);
        return () => listeners.delete(listener);
      }, []);
    }

    function makeBackdrop(ctx) {
      return function Backdrop() {
        const [scheme, setScheme] = React.useState(() => readScheme(ctx));
        const [, force] = React.useState(0);
        React.useEffect(() => ctx.on('theme/change', () => setScheme(readScheme(ctx))), []);
        React.useEffect(() => {
          const listener = () => force((n) => n + 1);
          listeners.add(listener);
          return () => listeners.delete(listener);
        }, []);
        return h('style', null, cssFor(scheme, settings));
      };
    }

    // The waifu switch lives in the session header's right-aligned utility row.
    function WaifuToggle() {
      useSettings();
      const on = !!settings.waifu;
      return h(
        'button',
        {
          type: 'button',
          title: on ? 'waifu 模式已开：点击关闭' : 'waifu 模式已关：点击开启',
          'aria-pressed': on,
          onClick: () => updateSettings({ waifu: !on }),
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 28,
            padding: '0 10px',
            cursor: 'pointer',
            fontSize: 12,
            lineHeight: 1,
            borderRadius: 8,
            color: on ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)',
            background: on ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
            border: `1px solid ${on ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l2)'}`,
          },
        },
        on ? '♥' : '♡',
        'waifu',
      );
    }

    // The guide list paints this beside the entry title. Self-contained on
    // purpose: reaching into the primitives package for an icon would add a
    // module dependency that can fail at load, and the placeholders DSH falls
    // back to are a generic cube.
    function CardIcon(props) {
      const size = (props && props.size) || 16;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-hidden': true,
        },
        h('rect', {
          x: 2.75,
          y: 1.75,
          width: 10.5,
          height: 12.5,
          rx: 2.5,
          stroke: 'currentColor',
          strokeWidth: 1.2,
        }),
        h('circle', { cx: 8, cy: 6.1, r: 2.1, stroke: 'currentColor', strokeWidth: 1.2 }),
        h('path', {
          d: 'M4.7 13.1c.5-1.9 1.9-2.9 3.3-2.9s2.8 1 3.3 2.9',
          stroke: 'currentColor',
          strokeWidth: 1.2,
          strokeLinecap: 'round',
        }),
      );
    }

    // The portrait standing on the interface itself. It rides in the same
    // overlay slot the backdrop uses, and it is pointer-events:none so it can
    // never swallow a click meant for the app — a decoration must not be able to
    // break the thing it decorates.
    function FloatingPortrait() {
      useSettings();
      if (!settings.float || !settings.cardPortrait) return null;
      const corner = FLOAT_CORNERS[settings.floatCorner] || FLOAT_CORNERS['bottom right'];
      const height = clampNumber(settings.floatSize, 60, 900);
      const ratio = settings.cardPortraitRatio > 0 ? settings.cardPortraitRatio : 0.75;
      // The nudge folds into the anchored edge rather than into a transform, so
      // it stays a plain screen-space shift whatever corner is chosen and it
      // cannot fight the mirror.
      const dx = clampNumber(settings.floatOffsetX, -600, 600);
      const dy = clampNumber(settings.floatOffsetY, -600, 600);
      const inset = { ...corner.style };
      if ('left' in inset) inset.left += dx;
      if ('right' in inset) inset.right -= dx;
      if ('top' in inset) inset.top += dy;
      if ('bottom' in inset) inset.bottom -= dy;
      return h('div', {
        'aria-hidden': true,
        style: {
          position: 'fixed',
          ...inset,
          width: Math.round(height * ratio),
          height,
          maxWidth: '42vw',
          zIndex: 5,
          pointerEvents: 'none',
          opacity: clampPercent(settings.floatOpacity),
          backgroundImage: `url("${settings.cardPortrait}")`,
          backgroundSize: 'contain',
          backgroundPosition: 'bottom center',
          backgroundRepeat: 'no-repeat',
          transform: settings.floatFlip ? 'scaleX(-1)' : 'none',
          filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.18))',
        },
      });
    }

    function CharacterCard() {
      useSettings();
      // Which expression is showing is a view state, not a setting: it should
      // not be written to localStorage every time a face is tapped.
      const [activeKey, setActiveKey] = React.useState(null);
      const expressions = Array.isArray(settings.expressions) ? settings.expressions : [];
      const active = activeKey ? expressions.find((item) => item.key === activeKey) : null;
      const portrait = (active && active.image) || settings.cardPortrait;
      const ratio = (active && active.ratio) || settings.cardPortraitRatio || 0.75;
      const configured = !!(settings.cardPortrait || settings.cardName || settings.cardBg);

      const cardStyle = {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 14,
        borderRadius: settings.cardRadius,
        overflow: 'hidden',
        color: settings.cardText,
        background: rgba(settings.cardColor, clampPercent(settings.cardOpacity)),
        boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.22), 0 10px 30px rgba(0,0,0,0.12)',
      };

      const layers = [];
      if (settings.cardBg) layers.push(`url("${settings.cardBg}")`);

      return h(
        'div',
        { style: { height: '100%', overflowY: 'auto', padding: 14, boxSizing: 'border-box' } },

        !configured
          ? h(
              'div',
              { style: { fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' } },
              '角色卡还没配置。到「设置 → 美化 → 角色卡」里放一张立绘、写个名字，这里就有了。',
            )
          : h(
              'div',
              { style: cardStyle },

              settings.cardBg
                ? h('div', {
                    'aria-hidden': true,
                    style: {
                      position: 'absolute',
                      inset: 0,
                      zIndex: 0,
                      pointerEvents: 'none',
                      backgroundImage: layers.join(','),
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      opacity: 1,
                      filter: settings.cardBgBlur > 0 ? `blur(${settings.cardBgBlur}px)` : 'none',
                      transform: settings.cardBgBlur > 0 ? `scale(${1 + settings.cardBgBlur / 200})` : 'none',
                    },
                  })
                : null,

              h(
                'div',
                { style: { position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 12 } },

                portrait
                  ? h('div', {
                      style: {
                        width: '100%',
                        aspectRatio: String(ratio),
                        maxHeight: '52vh',
                        borderRadius: Math.max(6, settings.cardRadius - 6),
                        backgroundImage: `url("${portrait}")`,
                        backgroundSize: settings.cardPortraitFit,
                        backgroundPosition: active ? 'center' : settings.cardPortraitPos,
                        backgroundRepeat: 'no-repeat',
                        backgroundColor: 'rgba(255,255,255,0.04)',
                      },
                    })
                  : null,

                expressions.length
                  ? h(
                      'div',
                      { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
                      expressions.map((item) =>
                        h(
                          'button',
                          {
                            key: item.key,
                            type: 'button',
                            title: item.name,
                            onClick: () => setActiveKey(activeKey === item.key ? null : item.key),
                            style: {
                              width: 34,
                              height: 34,
                              padding: 0,
                              cursor: 'pointer',
                              borderRadius: 10,
                              border:
                                activeKey === item.key
                                  ? '1.5px solid currentColor'
                                  : '1px solid rgba(255,255,255,0.25)',
                              backgroundImage: `url("${item.image}")`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center top',
                              opacity: activeKey && activeKey !== item.key ? 0.5 : 1,
                            },
                          },
                          null,
                        ),
                      ),
                      activeKey
                        ? h(
                            'button',
                            {
                              type: 'button',
                              onClick: () => setActiveKey(null),
                              style: {
                                height: 34,
                                padding: '0 10px',
                                cursor: 'pointer',
                                borderRadius: 10,
                                fontSize: 12,
                                color: 'inherit',
                                background: 'rgba(255,255,255,0.12)',
                                border: '1px solid rgba(255,255,255,0.25)',
                              },
                            },
                            '回到立绘',
                          )
                        : null,
                    )
                  : null,

                settings.cardName
                  ? h('div', { style: { fontSize: 19, fontWeight: 600, letterSpacing: '0.04em' } }, settings.cardName)
                  : null,
                settings.cardLine
                  ? h(
                      'div',
                      { style: { fontSize: 12.5, lineHeight: '20px', opacity: 0.82, whiteSpace: 'pre-wrap' } },
                      settings.cardLine,
                    )
                  : null,
              ),
            ),
      );
    }

    // Downscale before storing: localStorage is a few MB, a phone photo is not.
    function prepareImage(file, maxWidth) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('读取文件失败'));
        reader.onload = () => {
          const probe = new Image();
          probe.onerror = () => reject(new Error('这个文件解不出图片'));
          probe.onload = () => {
            const scale = Math.min(1, maxWidth / probe.naturalWidth);
            const width = Math.max(1, Math.round(probe.naturalWidth * scale));
            const height = Math.max(1, Math.round(probe.naturalHeight * scale));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const surface = canvas.getContext('2d');
            surface.drawImage(probe, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', IMAGE_QUALITY));
          };
          probe.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }

    function loadImageElement(src) {
      return new Promise((resolve, reject) => {
        const probe = new Image();
        probe.onerror = () => reject(new Error('这个文件解不出图片'));
        probe.onload = () => resolve(probe);
        probe.src = src;
      });
    }

    // A ripple texture is a highlight, so it is mostly transparent. This keeps
    // the alpha channel (webp, not the jpeg the photo slots use) and bakes the
    // chosen strength straight into that alpha: CSS has no per-background-layer
    // opacity, and folding it into the pixels is the only honest way to offer a
    // strength slider that behaves. The blur is baked here too, for the same
    // reason — a background-image cannot be filtered on its own.
    function bakeTexture(image, opacity, blur) {
      const scale = Math.min(1, TEXTURE_MAX_WIDTH / image.naturalWidth);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const surface = canvas.getContext('2d');
      surface.globalAlpha = clampPercent(opacity);
      const radius = clampNumber(blur, 0, 60);
      // Blurring pulls in the transparent surround, so the edge of the texture
      // feathers out instead of staying a hard cut.
      if (radius > 0) surface.filter = `blur(${radius}px)`;
      surface.drawImage(image, 0, 0, width, height);
      return canvas.toDataURL('image/webp', TEXTURE_QUALITY);
    }

    // General-purpose downscale for the artwork slots. Webp again, because a
    // cut-out portrait has to keep its alpha to sit on the card background.
    function downscale(image, maxWidth, quality) {
      const scale = Math.min(1, maxWidth / image.naturalWidth);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(image, 0, 0, width, height);
      return { url: canvas.toDataURL('image/webp', quality), ratio: width / height };
    }

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('读取文件失败'));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    }

    const SLIDERS = {
      glass: [
        { key: 'glassBlur', label: '玻璃模糊', min: 0, max: 60, step: 1, unit: 'px', hint: '面板自己那一层的高斯模糊。调大才像水玻璃；0 就只剩透明，像一块塑料片。注意这和「背景图高斯模糊」不是一回事：那个糊的是整张背景图。' },
        { key: 'glassSaturate', label: '玻璃饱和', min: 100, max: 260, step: 5, unit: '%', hint: '透上来的颜色会更艳。通透感里有很大一部分其实是它在干活。' },
        { key: 'glassHighlight', label: '玻璃高光', min: 0, max: 100, step: 1, unit: '%', hint: '面的上沿亮边，现在是三层叠出来的（亮线 + 一小段往下晕开 + 一圈 1px 描边），所以比之前那条 1px 细线实。0 会得到完全没棱的色块。' },
        { key: 'glassSheen', label: '气泡水波高光', min: 0, max: 100, step: 1, unit: '%', hint: '气泡鼓起来的那层水。它只画三处：上沿一道亮带、左上角一小摊聚光、下沿一点反光——中间是留空的，因为那才是透过去看东西的地方。往小拉更像水，往大拉会糊成奶白。觉得不够透，要动的是下面「AI 气泡不透明度」，不是这一条。' },
      ],
      overall: [
        { key: 'sidebar', label: '左侧栏不透明度', min: 0, max: 100, step: 1, unit: '%', hint: '水玻璃的「通透度」就是这一条：数字越低越透。开着水玻璃时它同时也是那层玻璃的底色浓度。' },
        { key: 'mainArea', label: '主区域底色不透明度', min: 0, max: 100, step: 1, unit: '%', hint: '聊天区和输入框共用这一层。0% 让背景图直接透上来。' },
        { key: 'dialog', label: '弹窗与浮层不透明度', min: 0, max: 100, step: 1, unit: '%', hint: '设置面板、菜单、弹层。开着水玻璃时，它也顺便决定菜单那块玻璃的浓度。' },
        { key: 'imageOpacity', label: '背景图不透明度', min: 0, max: 100, step: 1, unit: '%', hint: '调低会让渐变的颜色透出来。' },
        { key: 'imageBlur', label: '背景图高斯模糊', min: 0, max: 60, step: 1, unit: 'px', hint: '0 是原图。' },
      ],
      bubble: [
        { key: 'bubbleOpacity', label: '气泡不透明度', min: 0, max: 100, step: 1, unit: '%', hint: '和上面的颜色合起来用。' },
        { key: 'bubbleRadius', label: '气泡圆角', min: 0, max: 40, step: 1, unit: 'px', hint: '0 是方角，18 左右是默认的圆润感。' },
        { key: 'bubbleBlur', label: '气泡毛玻璃', min: 0, max: 40, step: 1, unit: 'px', hint: '气泡自己带一层背景模糊；配合背景图最好看。' },
      ],
      avatar: [
        { key: 'avatarSize', label: '头像大小', min: 16, max: 96, step: 1, unit: 'px', hint: '两侧头像共用一个大小。正方形，显示时裁成圆形。' },
      ],
      waifu: [
        { key: 'aiBubbleOpacity', label: 'AI 气泡不透明度', min: 0, max: 100, step: 1, unit: '%', hint: 'AI 回复那一侧的气泡。' },
      ],
      card: [
        { key: 'cardOpacity', label: '卡面不透明度', min: 0, max: 100, step: 1, unit: '%', hint: '卡片自己那一层底色。调低就透出后面的房间。' },
        { key: 'cardRadius', label: '卡面圆角', min: 0, max: 40, step: 1, unit: 'px', hint: '和气泡分开，因为卡片的圆角观感跟气泡不一样。' },
        { key: 'cardBgBlur', label: '卡面背景模糊', min: 0, max: 40, step: 1, unit: 'px', hint: '只糊卡面自己那张背景图。立绘不受影响。' },
        { key: 'floatSize', label: '悬浮立绘高度', min: 60, max: 900, step: 10, unit: 'px', hint: '宽度按立绘自己的比例自动算，所以不会拉变形。' },
        { key: 'floatOpacity', label: '悬浮立绘不透明度', min: 5, max: 100, step: 1, unit: '%', hint: '调到七八十会像贴纸浮在上面，调低像淡淡的水印。' },
        { key: 'floatOffsetX', label: '水平微调', min: -600, max: 600, step: 2, unit: 'px', hint: '正值往右，负值往左。和「站哪一角」是叠加的，所以换角之后不用重新调。' },
        { key: 'floatOffsetY', label: '垂直微调', min: -600, max: 600, step: 2, unit: 'px', hint: '正值往下，负值往上。左下角想离底边远一点就往负的拉。' },
      ],
    };

    const AVATAR_POSITIONS = [
      ['left top', 'center top', 'right top'],
      ['left center', 'center center', 'right center'],
      ['left bottom', 'center bottom', 'right bottom'],
    ];

    // Ordered gentlest first: these are the strength control for an imported
    // texture, because the baked alpha is a blunt instrument and the blend mode
    // is what decides how hard the texture pushes on the bubble's own colour.
    const RIPPLE_BLENDS = [
      ['soft-light', '柔和'],
      ['overlay', '叠加'],
      ['screen', '提亮'],
      ['luminosity', '只取明暗'],
    ];

    function blendLabel(value) {
      const hit = RIPPLE_BLENDS.find(([name]) => name === value);
      return hit ? hit[1] : value;
    }

    // Where the floating portrait parks. The offsets are deliberately generous
    // enough to clear the composer and the scrollbar.
    const FLOAT_CORNERS = {
      'top left': { label: '左上', style: { top: 24, left: 24 } },
      'top right': { label: '右上', style: { top: 24, right: 24 } },
      'bottom left': { label: '左下', style: { bottom: 24, left: 24 } },
      'bottom right': { label: '右下', style: { bottom: 24, right: 24 } },
    };

    const panelStyle = { padding: '4px 0', maxWidth: 560 };
    const hintStyle = { fontSize: 12, marginTop: 4, color: 'var(--dsw-alias-label-secondary)' };
    const headStyle = { fontSize: 14, color: 'var(--dsw-alias-label-primary)' };
    const groupStyle = {
      fontSize: 13,
      fontWeight: 600,
      margin: '26px 0 12px',
      color: 'var(--dsw-alias-label-secondary)',
      letterSpacing: '0.02em',
    };
    const buttonStyle = {
      padding: '6px 14px',
      fontSize: 13,
      cursor: 'pointer',
      borderRadius: 8,
      color: 'var(--dsw-alias-label-primary)',
      background: 'var(--dsw-alias-interactive-bg-hover)',
      border: '1px solid var(--dsw-alias-border-l2)',
    };

    // One implementation, two settings pages. `only` picks which half renders,
    // so the card gets its own entry beside 美化 in the settings menu instead of
    // being buried at the bottom of a long panel — without a second copy of the
    // helpers.
    const BeautifyPanel = () => h(BeautifySettings, { only: 'beautify' });
    const CardPanel = () => h(BeautifySettings, { only: 'card' });

    function BeautifySettings(props) {
      const only = (props && props.only) || 'all';
      useSettings();
      const [status, setStatus] = React.useState('');
      const [texOpen, setTexOpen] = React.useState(true);

      const pick = (key, maxWidth) => (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        setStatus('处理中…');
        prepareImage(file, maxWidth)
          .then((dataUrl) => {
            const patch = {};
            patch[key] = dataUrl;
            const ok = updateSettings(patch);
            setStatus(ok ? '' : '图片太大，浏览器存不下；这次能用，但重开就没了。');
          })
          .catch((error) => setStatus(String((error && error.message) || error)));
      };

      const fileRow = (title, key, maxWidth, emptyHint) =>
        h(
          'div',
          { style: { marginBottom: 18 } },
          h('div', { style: { ...headStyle, marginBottom: 8 } }, title),
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
            h('input', {
              type: 'file',
              accept: 'image/*',
              onChange: pick(key, maxWidth),
              style: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' },
            }),
            settings[key]
              ? h(
                  'button',
                  {
                    type: 'button',
                    style: buttonStyle,
                    onClick: () => {
                      const patch = {};
                      patch[key] = null;
                      updateSettings(patch);
                      setStatus('');
                    },
                  },
                  `移除${title}`,
                )
              : null,
          ),
          h('div', { style: hintStyle }, settings[key] ? `已加载（最长边压到 ${maxWidth}px 再存）。` : emptyHint),
        );

      const slider = (row) =>
        h(
          'div',
          { key: row.key, style: { marginBottom: 18 } },
          h(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 6,
              },
            },
            h('span', { style: headStyle }, row.label),
            h(
              'span',
              {
                style: {
                  fontSize: 13,
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--dsw-alias-label-secondary)',
                },
              },
              `${settings[row.key]}${row.unit}`,
            ),
          ),
          h('input', {
            type: 'range',
            min: row.min,
            max: row.max,
            step: row.step,
            value: settings[row.key],
            style: { width: '100%', accentColor: 'var(--dsw-alias-brand-primary)' },
            onChange: (event) => {
              const patch = {};
              patch[row.key] = Number(event.target.value);
              updateSettings(patch);
            },
          }),
          h('div', { style: hintStyle }, row.hint),
        );

      const toggleRow = (key, label, hint) =>
        h(
          'div',
          { style: { marginBottom: 18 } },
          h(
            'label',
            { style: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' } },
            h('input', {
              type: 'checkbox',
              checked: !!settings[key],
              onChange: (event) => {
                const patch = {};
                patch[key] = event.target.checked;
                updateSettings(patch);
              },
              style: { width: 16, height: 16, accentColor: 'var(--dsw-alias-brand-primary)' },
            }),
            h('span', { style: headStyle }, label),
          ),
          h('div', { style: hintStyle }, hint),
        );

      const positionGrid = (key, imageKey, label, hint) =>
        h(
          'div',
          { style: { marginBottom: 18 } },
          h('div', { style: { ...headStyle, marginBottom: 8 } }, label),
          h(
            'div',
            { style: { display: 'inline-grid', gridTemplateColumns: 'repeat(3, 34px)', gap: 4 } },
            AVATAR_POSITIONS.flatMap((row) =>
              row.map((pos) =>
                h('button', {
                  key: pos,
                  type: 'button',
                  title: pos,
                  onClick: () => {
                    const patch = {};
                    patch[key] = pos;
                    updateSettings(patch);
                  },
                  style: {
                    width: 34,
                    height: 34,
                    cursor: 'pointer',
                    borderRadius: 8,
                    border:
                      settings[key] === pos
                        ? '2px solid var(--dsw-alias-brand-primary)'
                        : '1px solid var(--dsw-alias-border-l2)',
                    background:
                      settings[key] === pos ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
                    backgroundImage: settings[imageKey] ? `url("${settings[imageKey]}")` : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: pos,
                    opacity: settings[imageKey] ? 1 : 0.4,
                  },
                }),
              ),
            ),
          ),
          h('div', { style: hintStyle }, hint),
        );

      const colorRow = (key, label, hint) =>
        h(
          'div',
          { style: { marginBottom: 18 } },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } },
            h('span', { style: headStyle }, label),
            h('input', {
              type: 'color',
              value: settings[key],
              onChange: (event) => {
                const patch = {};
                patch[key] = event.target.value;
                updateSettings(patch);
              },
              style: {
                width: 56,
                height: 28,
                padding: 0,
                cursor: 'pointer',
                border: '1px solid var(--dsw-alias-border-l2)',
                borderRadius: 8,
                background: 'transparent',
              },
            }),
          ),
          h('div', { style: hintStyle }, hint),
        );

      const group = (name) => h('div', { style: groupStyle }, name);

      const textRow = (key, label, placeholder, hint) =>
        h(
          'div',
          { style: { marginBottom: 18 } },
          h('div', { style: { ...headStyle, marginBottom: 6 } }, label),
          h('input', {
            type: 'text',
            value: settings[key],
            placeholder,
            onChange: (event) => updateSettings({ [key]: event.target.value }),
            style: {
              width: '100%',
              boxSizing: 'border-box',
              padding: '7px 10px',
              fontSize: 13,
              fontFamily: 'inherit',
              color: 'var(--dsw-alias-label-primary)',
              background: 'var(--dsw-alias-interactive-bg-hover)',
              border: '1px solid var(--dsw-alias-border-l2)',
              borderRadius: 8,
            },
          }),
          h('div', { style: hintStyle }, hint),
        );

      const areaRow = (key, label, placeholder, hint) =>
        h(
          'div',
          { style: { marginBottom: 18 } },
          h('div', { style: { ...headStyle, marginBottom: 6 } }, label),
          h('textarea', {
            value: settings[key],
            placeholder,
            rows: 4,
            onChange: (event) => updateSettings({ [key]: event.target.value }),
            style: {
              width: '100%',
              boxSizing: 'border-box',
              padding: '7px 10px',
              fontSize: 13,
              lineHeight: '20px',
              fontFamily: 'inherit',
              resize: 'vertical',
              color: 'var(--dsw-alias-label-primary)',
              background: 'var(--dsw-alias-interactive-bg-hover)',
              border: '1px solid var(--dsw-alias-border-l2)',
              borderRadius: 8,
            },
          }),
          h('div', { style: hintStyle }, hint),
        );

      const choiceRow = (key, label, options, hint) =>
        h(
          'div',
          { style: { marginBottom: 18 } },
          h('div', { style: { ...headStyle, marginBottom: 8 } }, label),
          h(
            'div',
            { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
            options.map(([value, text]) =>
              h(
                'button',
                {
                  key: value,
                  type: 'button',
                  onClick: () => updateSettings({ [key]: value }),
                  style: {
                    ...buttonStyle,
                    background:
                      settings[key] === value ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
                    border:
                      settings[key] === value
                        ? '1px solid var(--dsw-alias-brand-primary)'
                        : '1px solid var(--dsw-alias-border-l2)',
                  },
                },
                text,
              ),
            ),
          ),
          h('div', { style: hintStyle }, hint),
        );

      const pickPortrait = (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        setStatus('处理中…');
        readFileAsDataUrl(file)
          .then(loadImageElement)
          .then((image) => {
            const baked = downscale(image, PORTRAIT_MAX_WIDTH, IMAGE_QUALITY);
            const ok = updateSettings({ cardPortrait: baked.url, cardPortraitRatio: baked.ratio });
            setStatus(ok ? '' : '图片太大，浏览器存不下；这次能用，但重开就没了。');
          })
          .catch((error) => setStatus(String((error && error.message) || error)));
      };

      // Expressions come in as a batch. Their filenames already name the mood
      // (expr_gentle.png), so the name is read off the file rather than asked
      // for again; re-picking a mood replaces it instead of duplicating it.
      const pickExpressions = (event) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (!files.length) return;
        setStatus('处理中…');
        Promise.all(
          files.map((file) =>
            readFileAsDataUrl(file)
              .then(loadImageElement)
              .then((image) => {
                const baked = downscale(image, EXPRESSION_MAX_WIDTH, EXPRESSION_QUALITY);
                const stem = file.name.replace(/\.[^.]+$/, '');
                const key = stem.replace(/^expr[_-]?/i, '') || stem;
                return {
                  key,
                  name: EXPRESSION_LABELS[key] || key,
                  image: baked.url,
                  ratio: baked.ratio,
                };
              }),
          ),
        )
          .then((items) => {
            const merged = (Array.isArray(settings.expressions) ? settings.expressions : []).slice();
            for (const item of items) {
              const at = merged.findIndex((existing) => existing.key === item.key);
              if (at >= 0) merged[at] = item;
              else merged.push(item);
            }
            const ok = updateSettings({ expressions: merged });
            setStatus(ok ? '' : '表情图太多，浏览器存不下；这次能用，但重开就没了。');
          })
          .catch((error) => setStatus(String((error && error.message) || error)));
      };

      const expressionRow = () => {
        const list = Array.isArray(settings.expressions) ? settings.expressions : [];
        return h(
          'div',
          { style: { marginBottom: 18 } },
          h('div', { style: { ...headStyle, marginBottom: 8 } }, '表情'),
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
            h('input', {
              type: 'file',
              accept: 'image/*',
              multiple: true,
              onChange: pickExpressions,
              style: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' },
            }),
            list.length
              ? h(
                  'button',
                  { type: 'button', style: buttonStyle, onClick: () => updateSettings({ expressions: [] }) },
                  '清空表情',
                )
              : null,
          ),
          list.length
            ? h(
                'div',
                { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 } },
                list.map((item) =>
                  h('div', {
                    key: item.key,
                    title: item.name,
                    style: {
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      border: '1px solid var(--dsw-alias-border-l2)',
                      backgroundImage: `url("${item.image}")`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center top',
                    },
                  }),
                ),
              )
            : null,
          h(
            'div',
            { style: hintStyle },
            list.length
              ? `已认到 ${list.length} 个情绪：${list.map((item) => item.name).join('、')}。文件名里 expr_ 后面那段就是情绪名，重选同一张会替换而不是叠加。`
              : '可以一次多选。文件名里 expr_ 后面那段会被当作情绪名（expr_gentle.png → 温柔），所以我不用再问你一遍。DSH 没有素材库，插件读不到磁盘路径，只能从文件选择框拿——但它会把图压小后存在浏览器里，选一次就够。',
          ),
        );
      };

      const pickTexture = (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        setStatus('处理中…');
        const reader = new FileReader();
        reader.onerror = () => setStatus('读取文件失败');
        reader.onload = () => {
          loadImageElement(reader.result)
            .then((image) => {
              const ok = updateSettings({ rippleSource: bakeTexture(image, 100) });
              setTexOpen(true);
              setStatus(ok ? '' : '图片太大，浏览器存不下；这次能用，但重开就没了。');
            })
            .catch((error) => setStatus(String((error && error.message) || error)));
        };
        reader.readAsDataURL(file);
      };

      const blendRow = () =>
        h(
          'div',
          { style: { margin: '12px 0 18px' } },
          h('div', { style: { ...headStyle, marginBottom: 8 } }, '融合方式'),
          h(
            'div',
            { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
            RIPPLE_BLENDS.map(([value, label]) =>
              h(
                'button',
                {
                  key: value,
                  type: 'button',
                  onClick: () => updateSettings({ rippleBlend: value }),
                  style: {
                    ...buttonStyle,
                    background:
                      settings.rippleBlend === value
                        ? 'var(--dsw-alias-interactive-bg-hover)'
                        : 'transparent',
                    border:
                      settings.rippleBlend === value
                        ? '1px solid var(--dsw-alias-brand-primary)'
                        : '1px solid var(--dsw-alias-border-l2)',
                  },
                },
                label,
              ),
            ),
          ),
          h(
            'div',
            { style: hintStyle },
            '「柔和」最不抢气泡的颜色，「叠加」更实，「提亮」只往上加光，「只取明暗」会丢掉贴图自己的颜色、只留它的明暗起伏。',
          ),
        );

      // Three sliders share one shape; only the range and the wording differ.
      const rippleSlider = (key, label, min, max, unit, hint) =>
        h(
          'div',
          { style: { marginBottom: 18 } },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6 } },
            h('span', { style: headStyle }, label),
            h(
              'span',
              { style: { fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--dsw-alias-label-secondary)' } },
              `${settings[key]}${unit}`,
            ),
          ),
          h('input', {
            type: 'range',
            min,
            max,
            step: 1,
            value: settings[key],
            style: { width: '100%', accentColor: 'var(--dsw-alias-brand-primary)' },
            onChange: (event) => updateSettings({ [key]: Number(event.target.value) }),
          }),
          h('div', { style: hintStyle }, hint),
        );

      const rippleDensitySlider = () =>
        rippleSlider(
          'rippleDensity',
          '平铺密度',
          1,
          12,
          ' 张',
          '横向一个屏里排几张。纵向几张由图片自己的长宽比决定——一张 4:3 的图排 4 张，竖着大约就是 3 行。调大 = 水纹更细更多，调小 = 更粗更少。',
        );

      const rippleBlurSlider = () =>
        rippleSlider(
          'rippleBlur',
          '贴图模糊',
          0,
          40,
          'px',
          '把水纹本身糊开。和「玻璃模糊」不是一回事：那个糊的是气泡背后的东西，这个糊的是水纹图案自己。边缘会跟着羽化，看着更像水而不是贴纸；平铺的接缝也会被它抹掉不少。',
        );

      const rippleOpacitySlider = () =>
        rippleSlider(
          'rippleOpacity',
          '贴图浓度',
          0,
          100,
          '%',
          '改这条会把贴图重新压一遍——透明度和模糊都是烘进像素里的，CSS 没有单层背景的不透明度、也没法单独模糊一层背景图。先挑「融合方式」，再定浓度。',
        );

      const textureRow = () => {
        const has = !!settings.rippleSource;
        return h(
          'div',
          { style: { marginBottom: 18 } },
          // With no texture chosen this whole block stays one line: a label and
          // a file picker. Guidance lives in the tooltip rather than a paragraph
          // nobody reads before they have an image to think about.
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
            h(
              'span',
              {
                style: headStyle,
                title:
                  '渐变画得出气泡的「边」，画不出中间游动的水光——那是照片才有的东西。选一张明暗柔和的水纹图，带透明通道的 PNG 最好：越透明的地方叠上去越淡。',
              },
              has ? '水波纹贴图' : '水波纹贴图（可选，明暗柔和的水纹图最好）',
            ),
            h('input', {
              type: 'file',
              accept: 'image/*',
              onChange: pickTexture,
              style: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' },
            }),
            has
              ? h(
                  'button',
                  {
                    type: 'button',
                    style: buttonStyle,
                    onClick: () => {
                      updateSettings({ rippleSource: null });
                      setStatus('');
                    },
                  },
                  '移除',
                )
              : null,
            has
              ? h(
                  'button',
                  { type: 'button', style: buttonStyle, onClick: () => setTexOpen((open) => !open) },
                  texOpen ? '收起' : '展开',
                )
              : null,
          ),
          has && !texOpen
            ? h(
                'div',
                { style: { ...hintStyle, marginTop: 6 } },
                `${settings.rippleDensity} 张/屏 · ${blendLabel(settings.rippleBlend)} · 浓度 ${settings.rippleOpacity}% · 模糊 ${settings.rippleBlur}px` +
                  (settings.rippleSidebar ? ' · 也铺到侧栏' : ''),
              )
            : null,
          has && texOpen
            ? h(
                'div',
                { style: { marginTop: 14 } },
                blendRow(),
                toggleRow(
                  'rippleAlign',
                  '随窗口对齐',
                  '开：整面水纹钉在窗口上不动，每个气泡只是从同一片水里切出来的一小块，相邻气泡的水纹是连着的——这才是一整片水，不是一格一格贴瓷砖。侧栏和气泡共用同一片，水面从左边一路淌进去。关：每个气泡各自铺一份。',
                ),
                rippleDensitySlider(),
                rippleBlurSlider(),
                rippleOpacitySlider(),
                toggleRow(
                  'rippleSidebar',
                  '也铺到左侧栏',
                  '同一张贴图、同一组参数，顺手铺到左边那条玻璃上。它的模糊和浓度跟气泡共用，所以调一处两边一起变。',
                ),
              )
            : null,
        );
      };

      return h(
        'div',
        { style: panelStyle },

        ...(only === 'card'
          ? []
          : [
        group('水玻璃材质'),
        toggleRow(
          'glass',
          '开启水玻璃材质',
          '磨砂玻璃是「把不透明度拉高」，所以拉到后面就变成一块不透明的板子——那正是你看到的现象。水玻璃反过来：底色一直很淡，靠模糊 + 饱和 + 上沿高光撑出玻璃感，所以又透又糊还有棱。打开下面几条才开始生效。',
        ),
        SLIDERS.glass.map(slider),
        toggleRow('glassSidebar', '作用到左侧栏', '侧栏自己那一层玻璃。关掉就只有浮层是玻璃，侧栏维持现在这样。'),
        toggleRow('glassPanel', '作用到菜单与弹窗', '顶栏菜单、右键菜单、悬浮卡、设置面板的上沿亮边。这一组本来就自带背景模糊，开了之后会按上面的模糊值走。'),
        toggleRow('glassBubble', '作用到气泡', '给气泡加上沿高光，并让透过来的颜色更艳。气泡的透明度和模糊仍归「气泡」那两组滑杆管。'),
        h(
          'div',
          { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 } },
          h(
            'button',
            {
              type: 'button',
              style: buttonStyle,
              onClick: () => {
                updateSettings({
                  glass: true,
                  glassBlur: 26,
                  glassSaturate: 165,
                  glassHighlight: 78,
                  glassSidebar: true,
                  glassPanel: true,
                  glassBubble: true,
                  // Without this the menus stay at whatever opacity they are at
                  // now, which is near-opaque, and the glass would be invisible.
                  dialog: 70,
                });
                setStatus('');
              },
            },
            '一键水玻璃',
          ),
          h(
            'button',
            { type: 'button', style: buttonStyle, onClick: () => updateSettings({ glass: false }) },
            '关掉水玻璃',
          ),
        ),
        h(
          'div',
          { style: hintStyle },
          '「一键水玻璃」只把上面这几条设成推荐值，外加把「弹窗与浮层不透明度」压到 70%——菜单太实就看不出玻璃。你自己调过的颜色、通透度和背景它都不碰。',
        ),
        textureRow(),

        group('背景'),
        fileRow('背景图', 'image', IMAGE_MAX_WIDTH, '选一张本地图片；会自动缩小后存在浏览器里，重开还在。'),

        group('waifu 模式'),
        toggleRow(
          'waifu',
          '开启 waifu 模式',
          '开了之后：AI 有头像、AI 的回复装进气泡。开关按钮也会出现在会话标题栏右上角。关掉就完全恢复原生样式。',
        ),
        colorRow('aiBubbleColor', 'AI 气泡颜色', 'AI 那一侧的气泡底色。'),
        fileRow('AI 头像', 'assistantAvatar', AVATAR_MAX_WIDTH, '不选的话，waifu 模式只有气泡、没有头像。'),
        positionGrid(
          'assistantAvatarPosition',
          'assistantAvatar',
          'AI 头像裁剪位置',
          '两边头像可以各选各的焦点。',
        ),
        slider(SLIDERS.waifu[0]),
        toggleRow(
          'splitBubbles',
          '按块切分气泡',
          '开：markdown 的每个段落、代码块、列表各自一个气泡。关：整条回复一个大气泡。句子级切分需要接管渲染器，暂时不做。',
        ),
        toggleRow(
          'hugBubbles',
          '气泡贴合内容',
          '开：短句就是小气泡，长段落才占满宽度。关：所有气泡一样宽（占满整列）。代码块和表格始终占满。',
        ),

        group('我的气泡与头像'),
        colorRow('bubbleColor', '气泡颜色', '这个颜色会顶掉默认的品牌蓝。'),
        fileRow('我的头像', 'avatar', AVATAR_MAX_WIDTH, '选一张本地图片；不需要预先裁成方形。'),
        positionGrid('avatarPosition', 'avatar', '我的头像裁剪位置', '头像按正方形裁成圆形，选一个焦点。'),

        group('整体'),
        SLIDERS.overall.map(slider),

        group('气泡'),
        SLIDERS.bubble.map(slider),

        group('头像'),
        SLIDERS.avatar.map(slider),
          ]),

        ...(only === 'beautify'
          ? []
          : [
        only === 'card' ? null : group('角色卡（右栏）'),
        h(
          'div',
          { style: { ...hintStyle, marginTop: -8, marginBottom: 14 } },
          '右栏的「工作区文件 / 新建终端 / 浏览器」那个列表里会多一个入口。立绘和表情都会压小后存在浏览器里。',
        ),
        // An on-screen self-check rather than a guess: the registry belongs to
        // another plugin and whether this context can reach it is a property of
        // where the loader put each of us.
        h(
          'div',
          {
            style: {
              ...hintStyle,
              marginBottom: 14,
              padding: '8px 10px',
              borderRadius: 8,
              lineHeight: '19px',
              background: 'var(--dsw-alias-interactive-bg-hover)',
              border: '1px solid var(--dsw-alias-border-l2)',
            },
          },
          h('div', { style: { color: 'var(--dsw-alias-label-primary)' } }, cardStateText()),
          h(
            'div',
            { style: { marginTop: 4, wordBreak: 'break-all' } },
            '已声明的服务：' +
              probeServices()
                .map(([name, ok]) => `${name} ${ok ? '✔' : '✘'}`)
                .join(' · '),
          ),
          h(
            'button',
            {
              type: 'button',
              style: { ...buttonStyle, marginTop: 8, padding: '4px 10px', fontSize: 12 },
              onClick: () => {
                if (hostCtx) tryRegisterCard(hostCtx);
                setStatus('');
              },
            },
            '重试注册',
          ),
        ),
        textRow('cardName', '名字', '例如：小满', '显示在立绘下面。留空就只有立绘。'),
        areaRow('cardLine', '一句设定', '想写什么写什么。', '会原样显示，换行也保留。'),
        h(
          'div',
          { style: { marginBottom: 18 } },
          h('div', { style: { ...headStyle, marginBottom: 8 } }, '立绘'),
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
            h('input', {
              type: 'file',
              accept: 'image/*',
              onChange: pickPortrait,
              style: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' },
            }),
            settings.cardPortrait
              ? h(
                  'button',
                  { type: 'button', style: buttonStyle, onClick: () => updateSettings({ cardPortrait: null }) },
                  '移除立绘',
                )
              : null,
          ),
          h(
            'div',
            { style: hintStyle },
            settings.cardPortrait
              ? `已加载（比例 ${settings.cardPortraitRatio.toFixed(2)}，最长边压到 ${PORTRAIT_MAX_WIDTH}px 再存）。框子按这个比例走，所以你给什么比例它就长什么样，不用迁就固定尺寸。`
              : '抠图最好——PNG 的透明通道会留着，立在卡面背景上。',
          ),
        ),
        choiceRow(
          'cardPortraitFit',
          '立绘显示方式',
          [
            ['contain', '完整显示'],
            ['cover', '填满裁切'],
          ],
          '「完整显示」保证全身都在，多余的地方留空；「填满裁切」铺满整幅但会切掉边角。',
        ),
        positionGrid('cardPortraitPos', 'cardPortrait', '立绘焦点', '只在「填满裁切」时起作用——选一个不想被切掉的地方。'),
        expressionRow(),
        fileRow('卡面背景', 'cardBg', IMAGE_MAX_WIDTH, '可选。不选就用下面的底色。'),
        colorRow('cardColor', '卡面底色', '立绘背后那一层颜色。'),
        colorRow('cardText', '文字颜色', '名字和设定的颜色。底色深就用浅字，反过来也一样。'),
        SLIDERS.card.map(slider),
        toggleRow(
          'float',
          '让立绘站在界面上',
          '开：立绘浮在窗口一角，不属于任何面板，收起右栏也在。它是 pointer-events:none，永远不会挡住点击——点它等于点什么都没有。',
        ),
        toggleRow('floatFlip', '水平翻转', '立绘朝向不对时用这个翻个面。'),
        choiceRow(
          'floatCorner',
          '立绘站哪一角',
          Object.keys(FLOAT_CORNERS).map((key) => [key, FLOAT_CORNERS[key].label]),
          '四个角。右下最不碍事，左下会压住会话列表的底部。',
        ),
          ]),

        status
          ? h('div', { style: { ...hintStyle, color: 'var(--dsw-alias-state-warn-primary)', marginBottom: 12 } }, status)
          : null,

        h(
          'button',
          {
            type: 'button',
            style: { ...buttonStyle, marginTop: 8 },
            onClick: () => {
              updateSettings({ ...DEFAULTS });
              setStatus('');
            },
          },
          '恢复默认',
        ),
        h(
          'div',
          { style: { ...hintStyle, marginTop: 10, lineHeight: '18px' } },
          '气泡圆角、毛玻璃、头像、waifu 版式，以及水玻璃那层侧栏玻璃，都要点名聊天区和侧栏自己的样式类——这些类名带哈希，DSH 升级后可能对不上（对不上只是那条规则不生效，不会坏）。其余全部走官方变量。水玻璃用到的 --dsw-specific-menu、--dsw-menu-backdrop-filter、--dsw-elevation-stroke 都是官方变量，升级不会丢。',
        ),
      );
    }

    // The right-bar registry is provided by another plugin, and whether this
    // plugin's context can see it is not something the source can tell us: it
    // depends on where the loader put each of us in the service tree. So the
    // attempt is retried, and the outcome is reported on screen rather than
    // guessed at from a blank pane.
    let hostCtx = null;
    let cardState = 'pending';
    // Only services this plugin actually declares. Reading an undeclared one
    // throws by design, so listing extras here would report ✘ for services that
    // exist perfectly well — which is exactly the wrong conclusion to draw at a
    // glance.
    const PROBE_SERVICES = ['slots', 'theme', 'sidebarRightTabs'];

    function probeServices() {
      if (!hostCtx) return [];
      return PROBE_SERVICES.map((name) => {
        let ok = false;
        try {
          ok = !!hostCtx[name];
        } catch (error) {
          ok = false;
        }
        return [name, ok];
      });
    }

    function cardStateText() {
      if (cardState === 'registered') return '右栏接口：已拿到，角色卡已注册';
      if (cardState === 'no-service') return '右栏接口：拿不到（ctx 上没有 sidebarRightTabs）';
      if (cardState.startsWith('error:')) return `右栏接口：注册时报错 —— ${cardState.slice(6)}`;
      return '右栏接口：还在等';
    }

    function tryRegisterCard(target) {
      if (cardState === 'registered') return true;
      try {
        if (!target.sidebarRightTabs || !target.slots) {
          cardState = 'no-service';
          return false;
        }
        target.effect(() =>
          target.sidebarRightTabs.register({
            id: CARD_ID,
            kind: CARD_KIND,
            priority: 'extension',
            title: () => '角色卡',
            guide: [
              {
                id: 'card',
                order: 30,
                title: () => '角色卡',
                description: () => '立绘、表情和设定',
                icon: CardIcon,
              },
            ],
          }),
        );
        target.slots.inject('sidebar.right.pane.tab', () =>
          target.slots.register({ name: 'sidebar.right.pane.tab', key: CARD_ID }, CharacterCard),
        );
        cardState = 'registered';
        return true;
      } catch (error) {
        cardState = `error:${(error && error.message) || String(error)}`;
        return false;
      }
    }

    return {
      // Cordis resolves service access through injection and *throws* on an
      // undeclared name ("cannot get property X without inject") — it does not
      // hand back undefined. sidebarRightTabs is therefore declared here rather
      // than probed for: cordis waits for a declared dependency, so this costs
      // nothing when the service is late, and there is no way to reach it
      // without the declaration. Note this is the cordis service list, not the
      // package list in package.json's dsh.client.inject — a wrong name in that
      // one is what stopped the whole bundle from loading.
      inject: ['slots', 'theme', 'sidebarRightTabs'],
      apply(ctx) {
        hostCtx = ctx;

        // The ripple is baked, not stored, so a reload has to rebuild it from
        // the full-alpha texture.
        scheduleRipple(settings.rippleSource, settings.rippleOpacity, settings.rippleBlur);

        ctx.effect(() => {
          const reapply = () => {
            disposeLayer = ctx.theme.overrideTokens(SOURCE, tokensFor(settings));
          };
          reapply();
          listeners.add(reapply);
          return () => {
            listeners.delete(reapply);
            if (disposeLayer) disposeLayer();
          };
        });

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'dsh-beautify-backdrop', order: -100 },
            makeBackdrop(ctx),
          ),
        );

        // Same slot, opposite end of the order: the backdrop sits behind the
        // app, the portrait in front of it.
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'dsh-beautify-float', order: 10 },
            FloatingPortrait,
          ),
        );

        ctx.slots.inject('conversation.session.header.utilities', () =>
          ctx.slots.register(
            { name: 'conversation.session.header.utilities', id: 'dsh-beautify-waifu', order: 20 },
            WaifuToggle,
          ),
        );

        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            { name: 'settings.section', id: 'dsh-beautify', order: 50, label: '美化' },
            BeautifyPanel,
          ),
        );

        // The card gets its own entry in the settings menu, beside 美化 rather
        // than under it. Same component, other half.
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            { name: 'settings.section', id: 'dsh-beautify-card', order: 60, label: '角色卡' },
            CardPanel,
          ),
        );

        // The right-bar card. Everything about it is optional: if the registry
        // never turns up, the rest of the plugin carries on untouched, which is
        // the whole point — an all-or-nothing plugin is what took the app down
        // earlier. The retry loop exists because a sibling plugin may provide
        // the service a moment after this runs.
        try {
          if (!tryRegisterCard(ctx)) {
            let tries = 0;
            const retry = () => {
              if (tryRegisterCard(ctx)) {
                notify();
                return;
              }
              if (++tries < 20) setTimeout(retry, 500);
              else notify();
            };
            setTimeout(retry, 400);
          }
        } catch (error) {
          console.error('[dsh-beautify] character card unavailable', error);
        }
      },
    };
  },
});
