<template>
	<Dialog v-model="open" :options="{ title: __('Scan code with camera'), size: 'md' }">
		<template #body-content>
			<div class="flex flex-col gap-3">
				<div v-if="cameras.length > 1" class="flex items-center gap-2">
					<label class="text-xs font-medium text-gray-600">{{ __("Camera") }}</label>
					<select
						v-model="selectedCameraId"
						@change="restartScanner"
						class="flex-1 text-xs border rounded-lg px-2 py-2 focus:outline-none"
					>
						<option v-for="c in cameras" :key="c.id" :value="c.id">{{ c.label }}</option>
					</select>
				</div>

				<div id="camera-scanner-reader" class="w-full min-h-[260px] rounded-lg overflow-hidden bg-black"></div>

				<p v-if="error" class="text-xs text-red-600">{{ error }}</p>
			</div>
		</template>
		<template #footer>
			<Button variant="subtle" @click="close">{{ __("Cancel") }}</Button>
		</template>
	</Dialog>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { Dialog, Button } from "frappe-ui";

const props = defineProps({
	modelValue: { type: Boolean, default: false },
});

const emit = defineEmits(["update:modelValue", "detected"]);

const open = computed({
	get: () => props.modelValue,
	set: (value) => emit("update:modelValue", value),
});

const cameras = ref([]);
const selectedCameraId = ref(null);
const error = ref("");
const scanning = ref(false);
let scanner = null;

function close() {
	emit("update:modelValue", false);
}

watch(open, async (isOpen) => {
	if (isOpen) {
		await initScanner();
	} else {
		await stopScanner();
	}
});

async function initScanner() {
	error.value = "";
	try {
		const { Html5Qrcode } = await import("html5-qrcode");
		const cams = await Html5Qrcode.getCameras();
		if (!cams || cams.length === 0) {
			error.value = __("No camera found on this device");
			return;
		}
		cameras.value = cams;
		const back = cams.find((c) => /back|rear|environment/i.test(c.label || "")) || cams[0];
		selectedCameraId.value = back.id;
		scanner = new Html5Qrcode("camera-scanner-reader");
		await startScanner();
	} catch (e) {
		error.value = friendlyCameraError(e);
	}
}

async function startScanner() {
	if (!scanner || !selectedCameraId.value) return;
	error.value = "";
	try {
		await scanner.start(
			{ deviceId: { exact: selectedCameraId.value } },
			{ fps: 10, qrbox: { width: 240, height: 240 } },
			(decodedText) => {
				emit("detected", decodedText);
				close();
			},
			() => {},
		);
		scanning.value = true;
	} catch (e) {
		error.value = friendlyCameraError(e);
	}
}

async function stopScanner() {
	try {
		if (scanner && scanning.value) {
			await scanner.stop();
		}
	} catch (e) {
		// ignore — scanner may already be stopped
	}
	scanning.value = false;
}

async function restartScanner() {
	await stopScanner();
	await startScanner();
}

function friendlyCameraError(e) {
	const msg = e?.message || String(e);
	if (/notallowed|permission|denied/i.test(msg)) {
		return __("Camera permission denied. Enable Camera in your browser site settings and use the HTTPS URL.");
	}
	if (/notreadable|overconstrained|in use|requested device/i.test(msg)) {
		return __("Camera unavailable or in use. Pick another camera or close other apps using it.");
	}
	return __("Could not start camera: ") + msg;
}

onBeforeUnmount(stopScanner);
</script>
