import { system, world } from "@minecraft/server";

const CONFIG = {
    defaultIdleSeconds: 11,
    warningSeconds: 3,
    movementTolerance: 0.12,
    rotationTolerance: 2.25,
    welcomeMessageTicks: 35,
    focusHeight: 1.35,
    cinematicFov: 30,
    afkMusicTrack: "record.cat",
    afkMusicVolume: 0.65,
    afkMusicFadeSeconds: 1.25,
    afkMusicRepeatMode: "loop",
    minIdleSeconds: 5,
    maxIdleSeconds: 600,
    collisionStep: 0.35,
    collisionBuffer: 0.18
};

const PASS_THROUGH_BLOCKS = new Set([
    "minecraft:air",
    "minecraft:cave_air",
    "minecraft:void_air",
    "minecraft:water",
    "minecraft:flowing_water",
    "minecraft:lava",
    "minecraft:flowing_lava",
    "minecraft:short_grass",
    "minecraft:tall_grass",
    "minecraft:fern",
    "minecraft:large_fern",
    "minecraft:deadbush",
    "minecraft:vine",
    "minecraft:glow_lichen",
    "minecraft:seagrass",
    "minecraft:tall_seagrass",
    "minecraft:snow_layer"
]);

const SHOT_LIBRARY = [
    { id: "hero-center", yawOffset: 8, distance: 4.0, height: 1.5, slide: 0.04, bob: 0.025, duration: 110, targetUp: 1.58, targetRight: 0 },
    { id: "hero-low", yawOffset: -18, distance: 4.9, height: 0.75, slide: 0.04, bob: 0.02, duration: 105, targetUp: 1.72, targetRight: 0 },
    { id: "front-medium", yawOffset: 32, distance: 4.8, height: 1.85, slide: 0.05, bob: 0.03, duration: 100, targetUp: 1.45, targetRight: 0 },
    { id: "profile", yawOffset: 88, distance: 4.6, height: 1.9, slide: 0.06, bob: 0.03, duration: 95, targetUp: 1.45, targetRight: 0.3 },
    { id: "over-shoulder", yawOffset: 146, distance: 3.9, height: 1.8, slide: 0.03, bob: 0.02, duration: 95, targetUp: 1.45, targetForward: 2.8, targetRight: -0.8 },
    { id: "hero-wide", yawOffset: -40, distance: 8.9, height: 3.1, slide: 0.08, bob: 0.035, duration: 125, targetUp: 1.45, targetRight: 0 },
    { id: "centered-wide", yawOffset: -158, distance: 10.4, height: 3.5, slide: 0.05, bob: 0.03, duration: 120, targetUp: 1.45, targetRight: 0 },
    { id: "far-establishing", yawOffset: 126, distance: 15.5, height: 7.2, slide: 0.1, bob: 0.04, duration: 135, targetUp: 1.35, targetRight: 0 },
    { id: "epic-overlook", yawOffset: -112, distance: 18.5, height: 10.8, slide: 0.1, bob: 0.04, duration: 145, targetUp: 1.35, targetRight: 0 },
    { id: "rear-hero", yawOffset: 175, distance: 5.6, height: 1.55, slide: 0.03, bob: 0.02, duration: 100, targetUp: 1.45, targetForward: 4.6, targetRight: 0 },
    { id: "side-silhouette", yawOffset: -92, distance: 9.8, height: 2.4, slide: 0.05, bob: 0.03, duration: 110, targetUp: 1.5, targetRight: 0 },
    { id: "tower-shot", yawOffset: 18, distance: 7.2, height: 8.5, slide: 0.04, bob: 0.03, duration: 105, targetUp: 1.2, targetRight: 0 },
    { id: "dutch-hero", yawOffset: 52, distance: 6.8, height: 1.3, slide: 0.05, bob: 0.025, duration: 100, targetUp: 1.65, targetRight: 0 },
    { id: "top-down", yawOffset: 180, distance: 0, height: 14.5, slide: 0, bob: 0.05, duration: 95, targetUp: 1.1, targetRight: 0 }
];

const playerStates = new Map();
const warningIntervals = new Map();
const actionBarIntervals = new Map();

function clonePosition(location) {
    return { x: location.x, y: location.y, z: location.z };
}

function cloneRotation(rotation) {
    return { x: rotation.x, y: rotation.y };
}

function clearTrackedRun(store, key) {
    const handle = store.get(key);
    if (handle !== undefined) {
        system.clearRun(handle);
        store.delete(key);
    }
}

function safeActionBar(player, message) {
    try {
        player.onScreenDisplay.setActionBar(message);
    } catch {}
}

function safeCommand(player, command) {
    try {
        player.runCommand(command);
    } catch {}
}

function safeChat(player, message) {
    try {
        player.sendMessage(message);
    } catch {}
}

function clearActionBar(player) {
    clearTrackedRun(actionBarIntervals, player.id);

    let pulses = 0;
    const handle = system.runInterval(() => {
        pulses++;
        safeActionBar(player, "");
        if (pulses >= 20) {
            clearTrackedRun(actionBarIntervals, player.id);
        }
    }, 1);

    actionBarIntervals.set(player.id, handle);
}

function stopWarning(playerId) {
    clearTrackedRun(warningIntervals, playerId);
}

function buildProgressBar(progress) {
    const clamped = Math.max(0, Math.min(1, progress));
    const totalSlots = 20;
    const filled = Math.round(clamped * totalSlots);
    return `[${"#".repeat(filled)}${"-".repeat(totalSlots - filled)}]`;
}

function getIdleTicks(state) {
    return Math.max(CONFIG.minIdleSeconds, state.idleSeconds) * 20;
}

function getWarningTicks(state) {
    return Math.min(CONFIG.warningSeconds * 20, Math.max(20, getIdleTicks(state) - 20));
}

function startWarning(player, state) {
    stopWarning(player.id);
    clearTrackedRun(actionBarIntervals, player.id);

    const warningTicks = getWarningTicks(state);
    let elapsed = 0;
    const show = () => {
        const progress = elapsed / warningTicks;
        const secondsLeft = Math.max(0, Math.ceil((warningTicks - elapsed) / 20));
        safeActionBar(player, `§c${buildProgressBar(progress)} §eAFK Cinematics MCBE ${secondsLeft}s`);
    };

    show();
    const handle = system.runInterval(() => {
        elapsed++;
        if (elapsed >= warningTicks) {
            stopWarning(player.id);
            return;
        }
        show();
    }, 1);

    warningIntervals.set(player.id, handle);
}

function hashString(text) {
    let hash = 0;
    for (let index = 0; index < text.length; index++) {
        hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }
    return hash;
}

function normalizeYaw(yaw) {
    let wrapped = yaw;
    while (wrapped > 180) wrapped -= 360;
    while (wrapped <= -180) wrapped += 360;
    return wrapped;
}

function angleDifference(current, previous) {
    return Math.abs(normalizeYaw(current - previous));
}

function distanceBetween(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

function lerpPosition(a, b, amount) {
    return {
        x: a.x + ((b.x - a.x) * amount),
        y: a.y + ((b.y - a.y) * amount),
        z: a.z + ((b.z - a.z) * amount)
    };
}

function rotateRelative(yaw, forward, right, up = 0) {
    const radians = yaw * Math.PI / 180;
    return {
        x: (-Math.sin(radians) * forward) + (Math.cos(radians) * right),
        y: up,
        z: (Math.cos(radians) * forward) + (Math.sin(radians) * right)
    };
}

function buildShotSequence(baseYaw, seed) {
    const sequence = [];
    const startIndex = seed % SHOT_LIBRARY.length;

    for (let index = 0; index < SHOT_LIBRARY.length; index++) {
        const template = SHOT_LIBRARY[(startIndex + index) % SHOT_LIBRARY.length];
        const mirrored = ((seed >> (index % 8)) & 1) === 1 ? -1 : 1;
        sequence.push({
            yaw: normalizeYaw(baseYaw + (template.yawOffset * mirrored)),
            distance: template.distance,
            height: template.height,
            slide: template.slide,
            bob: template.bob,
            duration: template.duration,
            targetUp: template.targetUp,
            targetForward: (template.targetForward ?? 0),
            targetRight: (template.targetRight ?? 0) * mirrored
        });
    }

    return sequence;
}

function ensureState(player) {
    let state = playerStates.get(player.id);
    if (state) {
        return state;
    }

    state = {
        lastPosition: clonePosition(player.location),
        lastRotation: cloneRotation(player.getRotation()),
        dimensionId: player.dimension.id,
        idleTicks: 0,
        idleSeconds: CONFIG.defaultIdleSeconds,
        isAfk: false,
        anchor: clonePosition(player.location),
        baseYaw: player.getRotation().y,
        sequence: [],
        sequenceIndex: 0,
        shotTicks: 0,
        originalNameTag: player.nameTag,
        waveClock: Math.random() * Math.PI * 2
    };

    playerStates.set(player.id, state);
    return state;
}

function refreshBaseline(player, state) {
    state.lastPosition = clonePosition(player.location);
    state.lastRotation = cloneRotation(player.getRotation());
    state.dimensionId = player.dimension.id;
}

function hasMoved(player, state) {
    if (player.dimension.id !== state.dimensionId) {
        return true;
    }

    const dx = Math.abs(player.location.x - state.lastPosition.x);
    const dy = Math.abs(player.location.y - state.lastPosition.y);
    const dz = Math.abs(player.location.z - state.lastPosition.z);
    const rotation = player.getRotation();
    const yawDelta = angleDifference(rotation.y, state.lastRotation.y);
    const pitchDelta = Math.abs(rotation.x - state.lastRotation.x);

    return dx > CONFIG.movementTolerance
        || dy > CONFIG.movementTolerance
        || dz > CONFIG.movementTolerance
        || yawDelta > CONFIG.rotationTolerance
        || pitchDelta > CONFIG.rotationTolerance;
}

function faceTarget(from, target) {
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const dz = target.z - from.z;
    const horizontal = Math.max(0.001, Math.sqrt((dx * dx) + (dz * dz)));

    return {
        pitch: -(Math.atan2(dy, horizontal) * 180 / Math.PI),
        yaw: normalizeYaw(-(Math.atan2(dx, dz) * 180 / Math.PI))
    };
}

function getBlockTypeId(dimension, position) {
    try {
        return dimension.getBlock({
            x: Math.floor(position.x),
            y: Math.floor(position.y),
            z: Math.floor(position.z)
        })?.typeId;
    } catch {
        return undefined;
    }
}

function isPassThroughType(typeId) {
    return typeId !== undefined && PASS_THROUGH_BLOCKS.has(typeId);
}

function isPassablePosition(dimension, position) {
    return isPassThroughType(getBlockTypeId(dimension, position));
}

function liftAboveCollision(dimension, position) {
    let lifted = clonePosition(position);

    for (let tries = 0; tries < 6; tries++) {
        if (isPassablePosition(dimension, lifted)) {
            return lifted;
        }

        lifted = {
            x: lifted.x,
            y: lifted.y + 0.5,
            z: lifted.z
        };
    }

    return lifted;
}

function pullCameraForward(dimension, focus, desired) {
    const travel = distanceBetween(focus, desired);
    if (travel <= 0.001) {
        return liftAboveCollision(dimension, desired);
    }

    const steps = Math.max(2, Math.ceil(travel / CONFIG.collisionStep));
    let safe = clonePosition(focus);

    for (let index = 1; index <= steps; index++) {
        const sample = lerpPosition(focus, desired, index / steps);
        if (!isPassablePosition(dimension, sample)) {
            const retreat = Math.min(1, CONFIG.collisionBuffer / travel);
            return lerpPosition(safe, focus, retreat);
        }
        safe = sample;
    }

    return liftAboveCollision(dimension, desired);
}

function getCameraFrame(player, state) {
    const shot = state.sequence[state.sequenceIndex];
    const progress = shot.duration <= 0 ? 0 : state.shotTicks / shot.duration;
    const breath = Math.sin(state.waveClock + (progress * Math.PI * 2));
    const drift = Math.cos((state.waveClock * 0.7) + (progress * Math.PI * 2));
    const anchor = state.anchor;
    const desiredOffset = rotateRelative(
        shot.yaw,
        shot.distance,
        drift * shot.slide,
        shot.height + (breath * shot.bob)
    );

    const desiredPosition = {
        x: anchor.x + desiredOffset.x,
        y: anchor.y + desiredOffset.y,
        z: anchor.z + desiredOffset.z
    };

    const targetOffset = rotateRelative(
        state.baseYaw,
        shot.targetForward,
        shot.targetRight,
        shot.targetUp
    );

    const target = {
        x: player.location.x + targetOffset.x,
        y: player.location.y + targetOffset.y,
        z: player.location.z + targetOffset.z
    };

    const resolvedPosition = pullCameraForward(player.dimension, target, desiredPosition);
    const rotation = faceTarget(resolvedPosition, target);

    return { position: resolvedPosition, rotation };
}

function startAfk(player, state) {
    stopWarning(player.id);
    clearActionBar(player);

    state.isAfk = true;
    state.idleTicks = getIdleTicks(state);
    state.anchor = clonePosition(player.location);
    state.baseYaw = player.getRotation().y;
    state.sequence = buildShotSequence(state.baseYaw, hashString(player.id));
    state.sequenceIndex = 0;
    state.shotTicks = 0;
    state.waveClock = Math.random() * Math.PI * 2;
    state.originalNameTag = player.nameTag;

    player.nameTag = `§7[AFK] §f${state.originalNameTag}`;
    safeCommand(player, "title @s times 0 45 12");
    safeCommand(player, 'titleraw @s subtitle {"rawtext":[{"text":"§fCreated By §cSpunky Insaan"}]}');
    safeCommand(player, 'titleraw @s title {"rawtext":[{"text":" "}]}');
    safeCommand(player, "hud @s hide all");
    safeCommand(player, `camera @s fov_set ${CONFIG.cinematicFov}`);
    safeCommand(
        player,
        `music play ${CONFIG.afkMusicTrack} ${CONFIG.afkMusicVolume} ${CONFIG.afkMusicFadeSeconds} ${CONFIG.afkMusicRepeatMode}`
    );
}

function stopAfk(player, state) {
    state.isAfk = false;
    state.idleTicks = 0;
    state.sequenceIndex = 0;
    state.shotTicks = 0;

    safeCommand(player, "camera @s clear");
    safeCommand(player, "camera @s fov_clear 0.2 linear");
    safeCommand(player, `music stop ${CONFIG.afkMusicFadeSeconds}`);
    safeCommand(player, "hud @s reset");
    player.nameTag = state.originalNameTag;

    stopWarning(player.id);
    clearTrackedRun(actionBarIntervals, player.id);
    clearActionBar(player);
}

function updateIdlePlayer(player, state) {
    state.idleTicks++;
    const idleTicks = getIdleTicks(state);
    const warningTicks = getWarningTicks(state);

    if (state.idleTicks === idleTicks - warningTicks) {
        startWarning(player, state);
    }

    if (state.idleTicks >= idleTicks) {
        startAfk(player, state);
    }
}

function updateAfkCamera(player, state) {
    const frame = getCameraFrame(player, state);
    safeCommand(
        player,
        `camera @s set minecraft:free pos ${frame.position.x.toFixed(3)} ${frame.position.y.toFixed(3)} ${frame.position.z.toFixed(3)} rot ${frame.rotation.pitch.toFixed(3)} ${frame.rotation.yaw.toFixed(3)}`
    );

    state.shotTicks++;
    const shot = state.sequence[state.sequenceIndex];
    if (state.shotTicks >= shot.duration) {
        state.sequenceIndex = (state.sequenceIndex + 1) % state.sequence.length;
        state.shotTicks = 0;
        state.waveClock = Math.random() * Math.PI * 2;
    }
}

function setPlayerIdleTime(player, seconds) {
    const state = ensureState(player);
    const clampedSeconds = Math.max(CONFIG.minIdleSeconds, Math.min(CONFIG.maxIdleSeconds, Math.floor(seconds)));

    state.idleSeconds = clampedSeconds;
    state.idleTicks = 0;
    stopWarning(player.id);
    refreshBaseline(player, state);

    safeChat(player, `§7[AFK] Start time set to §e${clampedSeconds}§7 seconds.`);
}

function startCinematicNow(player) {
    const state = ensureState(player);

    if (state.isAfk) {
        safeChat(player, "§7[AFK] Cinematic is already running.");
        return;
    }

    stopWarning(player.id);
    refreshBaseline(player, state);
    startAfk(player, state);
}

function sendCommandHelp(player) {
    safeChat(player, "§7[AFK] Commands: §eafkc start§7, §eafkc time <seconds>§7.");
}

function handleChatCommand(player, message) {
    const trimmed = message.trim();
    const normalized = trimmed.replace(/^[!/]/, "");
    const parts = normalized.split(/\s+/);

    if (parts.length === 0 || parts[0].toLowerCase() !== "afkc") {
        return false;
    }

    const subcommand = (parts[1] ?? "").toLowerCase();
    if (!subcommand) {
        sendCommandHelp(player);
        return true;
    }

    if (subcommand === "start") {
        startCinematicNow(player);
        return true;
    }

    if (subcommand === "time") {
        const rawSeconds = Number(parts[2]);
        if (!Number.isFinite(rawSeconds)) {
            safeChat(player, `§7[AFK] Usage: §eafkc time <${CONFIG.minIdleSeconds}-${CONFIG.maxIdleSeconds}>`);
            return true;
        }

        setPlayerIdleTime(player, rawSeconds);
        return true;
    }

    sendCommandHelp(player);
    return true;
}

function registerCommandListeners() {
    try {
        const beforeChat = world.beforeEvents?.chatSend;
        if (beforeChat && typeof beforeChat.subscribe === "function") {
            beforeChat.subscribe((event) => {
                const message = event.message.trim();
                if (!/^[/!]?(afkc)(\s|$)/i.test(message)) {
                    return;
                }

                event.cancel = true;
                system.run(() => handleChatCommand(event.sender, message));
            });
            return;
        }
    } catch {}

    try {
        const afterChat = world.afterEvents?.chatSend;
        if (afterChat && typeof afterChat.subscribe === "function") {
            afterChat.subscribe((event) => {
                const message = event.message.trim();
                if (!/^[/!]?(afkc)(\s|$)/i.test(message)) {
                    return;
                }

                system.run(() => handleChatCommand(event.sender, message));
            });
        }
    } catch {}
}

registerCommandListeners();

system.runInterval(() => {
    for (const player of world.getPlayers()) {
        const state = ensureState(player);

        if (hasMoved(player, state)) {
            refreshBaseline(player, state);

            if (state.isAfk) {
                stopAfk(player, state);
            } else {
                state.idleTicks = 0;
                stopWarning(player.id);
                clearActionBar(player);
            }

            state.anchor = clonePosition(player.location);
            continue;
        }

        if (state.isAfk) {
            updateAfkCamera(player, state);
            continue;
        }

        updateIdlePlayer(player, state);
    }
}, 1);

world.afterEvents.playerLeave.subscribe((event) => {
    stopWarning(event.playerId);
    clearTrackedRun(actionBarIntervals, event.playerId);
    playerStates.delete(event.playerId);
});
