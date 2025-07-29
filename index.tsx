/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type } from '@google/genai';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';


// --- DOM Elements ---
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
const generateBtn = document.getElementById('generate-button') as HTMLButtonElement;
const downloadToggleBtn = document.getElementById('download-toggle-button') as HTMLButtonElement;
const downloadOptions = document.getElementById('download-options') as HTMLDivElement;
const downloadGltfBtn = document.getElementById('download-gltf') as HTMLAnchorElement;
const downloadObjBtn = document.getElementById('download-obj') as HTMLAnchorElement;
const downloadStlBtn = document.getElementById('download-stl') as HTMLAnchorElement;
const buttonText = generateBtn.querySelector('.button-text') as HTMLSpanElement;
const spinner = generateBtn.querySelector('.spinner') as HTMLDivElement;
const errorMessageDiv = document.getElementById('error-message') as HTMLDivElement;
const canvas = document.getElementById('c') as HTMLCanvasElement;
const imageUploadInput = document.getElementById('image-upload-input') as HTMLInputElement;
const imageUploadBtn = document.getElementById('image-upload-btn') as HTMLButtonElement;
const imagePreview = document.getElementById('image-preview') as HTMLDivElement;
const previewImage = document.getElementById('preview-image') as HTMLImageElement;
const removeImageBtn = document.getElementById('remove-image-btn') as HTMLButtonElement;
const apiKeyModal = document.getElementById('api-key-modal') as HTMLDivElement;
const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
const saveApiKeyBtn = document.getElementById('save-api-key-btn') as HTMLButtonElement;
const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;


// --- State and Configuration ---
let controls: OrbitControls;
let camera: THREE.PerspectiveCamera;
let scene: THREE.Scene;
let renderer: THREE.WebGLRenderer;
let generatedContentGroup: THREE.Group;
let uploadedImage: { mimeType: string; data: string } | null = null;
let ai: GoogleGenAI | null = null;

// --- Gemini AI Configuration ---
const schema = {
  type: Type.OBJECT,
  properties: {
    backgroundColor: {
      type: Type.STRING,
      description: 'A hex color code for the scene background, e.g., #123456. Must be a dark color for good contrast.',
    },
    objects: {
      type: Type.ARRAY,
      description: 'A list of 3D objects in the scene.',
      items: {
        type: Type.OBJECT,
        properties: {
          shape: {
            type: Type.STRING,
            enum: ['box', 'sphere', 'cone', 'cylinder', 'torus'],
            description: 'The geometric shape of the object.',
          },
          color: {
            type: Type.STRING,
            description: 'The hex color code for the object, e.g., #ff0000.',
          },
          position: {
            type: Type.OBJECT,
            properties: {
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              z: { type: Type.NUMBER },
            },
            required: ['x', 'y', 'z'],
            description: 'The 3D position of the object center.',
          },
          scale: {
            type: Type.OBJECT,
            properties: {
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              z: { type: Type.NUMBER },
            },
            required: ['x', 'y', 'z'],
            description: 'The scale of the object on each axis. A value of 1 is a default size of roughly 1x1x1 meters.',
          },
        },
        required: ['shape', 'color', 'position', 'scale'],
      },
    },
  },
  required: ['backgroundColor', 'objects'],
};

// --- Main Application Logic ---

/**
 * Initializes the entire application.
 */
function main() {
  initScene();
  initEventListeners();
  checkApiKey();
  animate();
}

/**
 * Checks for API key and initializes AI or shows modal.
 */
function checkApiKey() {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
        initializeAi(savedKey);
    } else {
        apiKeyModal.style.display = 'flex';
    }
}

/**
 * Initializes the GoogleGenAI instance with the provided key.
 * @param key The user's Gemini API key.
 */
function initializeAi(key: string) {
    ai = new GoogleGenAI({ apiKey: key });
    localStorage.setItem('gemini_api_key', key);
    apiKeyModal.style.display = 'none';
}


/**
 * Sets up the basic Three.js scene, camera, renderer, and controls.
 */
function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000,
  );
  camera.position.z = 10;
  camera.position.y = 5;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  resizeRendererToDisplaySize();

  // Add lighting for better 3D effect
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
  directionalLight.position.set(5, 10, 7.5);
  scene.add(directionalLight);

  // Add orbit controls for user interaction
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = 1;
  controls.maxDistance = 500;
  controls.target.set(0, 1, 0);
  
  // Group to hold all AI-generated objects
  generatedContentGroup = new THREE.Group();
  scene.add(generatedContentGroup);
}

/**
 * Attaches event listeners for user interactions.
 */
function initEventListeners() {
  window.addEventListener('resize', onWindowResize);
  generateBtn.addEventListener('click', handleGenerateClick);
  imageUploadBtn.addEventListener('click', () => imageUploadInput.click());
  imageUploadInput.addEventListener('change', handleImageUpload);
  removeImageBtn.addEventListener('click', handleRemoveImage);
  
  // API Key Modal Listeners
  saveApiKeyBtn.addEventListener('click', handleSaveApiKey);
  settingsBtn.addEventListener('click', () => {
    apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
    apiKeyModal.style.display = 'flex';
  });
  
  // Download listeners
  downloadToggleBtn.addEventListener('click', toggleDownloadOptions);
  downloadGltfBtn.addEventListener('click', handleDownloadGLTF);
  downloadObjBtn.addEventListener('click', handleDownloadOBJ);
  downloadStlBtn.addEventListener('click', handleDownloadSTL);

  // Close dropdown if clicking outside
  window.addEventListener('click', (event) => {
    if (!downloadToggleBtn.contains(event.target as Node)) {
        downloadOptions.classList.remove('show');
    }
  });
}

/**
 * Saves the API key from the modal input.
 */
function handleSaveApiKey() {
    const key = apiKeyInput.value.trim();
    if (key) {
        initializeAi(key);
    } else {
        alert('Please enter a valid API key.');
    }
}


/**
 * Handles the "Generate" button click.
 */
async function handleGenerateClick() {
  if (!ai) {
    showError('Please set your Gemini API key in the settings before generating.');
    apiKeyModal.style.display = 'flex';
    return;
  }

  const prompt = promptInput.value;
  if (!prompt && !uploadedImage) {
    showError('Please enter a prompt or upload an image to describe the scene.');
    return;
  }
  
  setLoading(true);
  hideError();
  downloadToggleBtn.disabled = true;
  
  try {
    const contents = [];
    if (uploadedImage) {
        contents.push({
            inlineData: {
                mimeType: uploadedImage.mimeType,
                data: uploadedImage.data,
            }
        });
    }
    contents.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: `You are an expert 3D artist. Your task is to interpret a user's description and translate it into a structured JSON object that represents a 3D scene.

- Adhere strictly to the provided JSON schema.
- Be creative with colors and object placement to create a visually appealing scene based on the user's prompt.
- Place objects within a reasonable proximity to the origin (0,0,0), like within a 10x10x10 unit area.
- If a user provides an image, prioritize creating a 3D representation of the subjects in the image. Use the text prompt to refine the style or details.
- You must approximate complex shapes by creatively combining the available primitives ('box', 'sphere', 'cone', 'cylinder', 'torus'). For example, to represent a person, you might use spheres for the head, cylinders for limbs, and boxes for the torso. Be abstract and representative.
- Do not include any commentary or explanations outside of the JSON response.`,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    });

    const sceneData = JSON.parse(response.text);
    buildSceneFromData(sceneData);
  } catch (error) {
    console.error('Error generating scene:', error);
    showError('Failed to generate the scene. The AI may be unavailable, your API key may be invalid, or the request could not be processed. Please check your key and try again.');
  } finally {
    setLoading(false);
  }
}

/**
 * Handles the file input change event for image uploads.
 */
function handleImageUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        showError('Please upload a valid image file (JPG, PNG, WebP).');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const result = e.target?.result as string;
        const [header, base64Data] = result.split(',');
        
        uploadedImage = {
            mimeType: file.type,
            data: base64Data
        };
        
        previewImage.src = result;
        imagePreview.style.display = 'block';
        imageUploadBtn.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

/**
 * Removes the uploaded image and resets the UI.
 */
function handleRemoveImage() {
    uploadedImage = null;
    imageUploadInput.value = ''; // Reset file input
    imagePreview.style.display = 'none';
    previewImage.src = '#';
    imageUploadBtn.style.display = 'block';
}

/**
 * Toggles visibility of the download options dropdown.
 */
function toggleDownloadOptions() {
    if (!downloadToggleBtn.disabled) {
        downloadOptions.classList.toggle('show');
    }
}

/**
 * Triggers a file download for the given content.
 */
function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.style.display = 'none';
    document.body.appendChild(link);
    
    link.href = url;
    link.download = filename;
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    downloadOptions.classList.remove('show');
}

/**
 * Exports the generated scene as a .gltf file.
 */
function handleDownloadGLTF() {
  const exporter = new GLTFExporter();
  exporter.parse(
    generatedContentGroup,
    (gltf) => {
      const output = JSON.stringify(gltf, null, 2);
      const blob = new Blob([output], { type: 'application/gltf-buffer' });
      triggerDownload(blob, 'CanvasAI-Scene.gltf');
    },
    (error) => {
      console.error('An error occurred during GLTF export.', error);
      showError('Failed to export the scene as GLTF.');
    }
  );
}

/**
 * Exports the generated scene as a .obj file.
 */
function handleDownloadOBJ() {
  const exporter = new OBJExporter();
  try {
    const result = exporter.parse(generatedContentGroup);
    const blob = new Blob([result], { type: 'text/plain' });
    triggerDownload(blob, 'CanvasAI-Scene.obj');
  } catch (error) {
    console.error('An error occurred during OBJ export.', error);
    showError('Failed to export the scene as OBJ.');
  }
}

/**
 * Exports the generated scene as a .stl file.
 */
function handleDownloadSTL() {
  const exporter = new STLExporter();
  try {
    const result = exporter.parse(generatedContentGroup, { binary: false });
    const blob = new Blob([result], { type: 'application/vnd.ms-pki.stl' });
    triggerDownload(blob, 'CanvasAI-Scene.stl');
  } catch (error) {
    console.error('An error occurred during STL export.', error);
    showError('Failed to export the scene as STL.');
  }
}


/**
 * Clears old objects and builds a new scene from the provided data.
 * @param sceneData The JSON object describing the scene.
 */
function buildSceneFromData(sceneData: any) {
  // Clear previous content
  while (generatedContentGroup.children.length > 0) {
    generatedContentGroup.remove(generatedContentGroup.children[0]);
  }

  // Set new background
  scene.background = new THREE.Color(sceneData.backgroundColor || 0x111111);

  // Add new objects
  sceneData.objects.forEach((obj: any) => {
    let geometry;
    const s = obj.scale;
    switch (obj.shape) {
      case 'box':
        geometry = new THREE.BoxGeometry(s.x, s.y, s.z);
        break;
      case 'sphere':
        geometry = new THREE.SphereGeometry(Math.max(s.x, s.y, s.z) / 2, 32, 16);
        break;
      case 'cone':
        geometry = new THREE.ConeGeometry(s.x / 2, s.y, 32);
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(s.x / 2, s.z / 2, s.y, 32);
        break;
      case 'torus':
        geometry = new THREE.TorusGeometry(s.x / 2, s.y / 4, 16, 100);
        break;
      default:
        return; // Skip unknown shapes
    }

    const material = new THREE.MeshStandardMaterial({
      color: obj.color,
      roughness: 0.5,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
    
    generatedContentGroup.add(mesh);
  });
  
  if (sceneData.objects.length > 0) {
    downloadToggleBtn.disabled = false;
  }
}

/**
 * Animation loop that renders the scene.
 */
function animate() {
  requestAnimationFrame(animate);
  controls.update(); // only required if controls.enableDamping = true
  renderer.render(scene, camera);
}

// --- UI Utility Functions ---

function setLoading(isLoading: boolean) {
  generateBtn.disabled = isLoading;
  spinner.style.display = isLoading ? 'block' : 'none';
  buttonText.style.display = isLoading ? 'none' : 'block';
}

function showError(message: string) {
  errorMessageDiv.textContent = message;
  errorMessageDiv.style.display = 'block';
}

function hideError() {
  errorMessageDiv.style.display = 'none';
}

function onWindowResize() {
  resizeRendererToDisplaySize();
}

function resizeRendererToDisplaySize() {
  const canvas = renderer.domElement;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

// --- Start the App ---
main();