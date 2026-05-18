import { MIME_TYPES } from "@excalidraw/common";

const GOOGLE_API_SCRIPT = "https://apis.google.com/js/api.js";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API_BASE = "https://www.googleapis.com/upload/drive/v3";
const EXCALIDRAW_FILE_EXTENSION = ".excalidraw";

export type GoogleDriveFile = {
  id: string;
  name: string;
  mimeType?: string;
};

type GooglePickerDocument = {
  id: string;
  name?: string;
  mimeType?: string;
};

type GooglePickerResponse = {
  action?: string;
  docs?: GooglePickerDocument[];
};

declare global {
  interface Window {
    gapi?: {
      load: (api: string, callback: () => void) => void;
    };
    google?: {
      picker: {
        Action: {
          PICKED: string;
          CANCEL: string;
        };
        DocsView: new () => {
          setIncludeFolders: (includeFolders: boolean) => any;
          setMimeTypes: (mimeTypes: string) => any;
          setSelectFolderEnabled: (selectFolderEnabled: boolean) => any;
        };
        Feature: {
          NAV_HIDDEN: string;
          SUPPORT_DRIVES: string;
        };
        PickerBuilder: new () => {
          setAppId: (appId: string) => any;
          setOAuthToken: (token: string) => any;
          setDeveloperKey: (key: string) => any;
          addView: (view: any) => any;
          enableFeature: (feature: string) => any;
          setCallback: (callback: (data: GooglePickerResponse) => void) => any;
          build: () => {
            setVisible: (visible: boolean) => void;
          };
        };
      };
    };
  }
}

const getPickerConfig = () => {
  const developerKey = import.meta.env.VITE_APP_GOOGLE_PICKER_API_KEY;
  const appId = import.meta.env.VITE_APP_GOOGLE_DRIVE_APP_ID;

  if (!developerKey || !appId) {
    throw new Error(
      "Google Drive is not configured. Set VITE_APP_GOOGLE_PICKER_API_KEY and VITE_APP_GOOGLE_DRIVE_APP_ID.",
    );
  }

  return { developerKey, appId };
};

const loadGoogleApiScript = async () => {
  if (window.gapi) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_API_SCRIPT}"]`,
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Failed to load Google API script.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_API_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google API script."));
    document.head.appendChild(script);
  });
};

const loadPickerApi = async () => {
  await loadGoogleApiScript();

  await new Promise<void>((resolve) => {
    window.gapi!.load("picker", resolve);
  });
};

export const pickGoogleDriveFile = async (
  accessToken: string,
): Promise<GoogleDriveFile | null> => {
  const { developerKey, appId } = getPickerConfig();
  await loadPickerApi();

  const picker = window.google?.picker;
  if (!picker) {
    throw new Error("Google Picker is unavailable.");
  }

  const view = new picker.DocsView()
    .setIncludeFolders(false)
    .setSelectFolderEnabled(false)
    .setMimeTypes(
      [
        MIME_TYPES.excalidraw,
        MIME_TYPES.json,
        MIME_TYPES.text,
        MIME_TYPES.binary,
      ].join(","),
    );

  return new Promise((resolve) => {
    const pickerInstance = new picker.PickerBuilder()
      .setAppId(appId)
      .setOAuthToken(accessToken)
      .setDeveloperKey(developerKey)
      .addView(view)
      .enableFeature(picker.Feature.SUPPORT_DRIVES)
      .setCallback((data: GooglePickerResponse) => {
        if (data.action === picker.Action.PICKED) {
          const file = data.docs?.[0];
          resolve(
            file
              ? {
                  id: file.id,
                  name: file.name || "Untitled.excalidraw",
                  mimeType: file.mimeType,
                }
              : null,
          );
          return;
        }

        if (data.action === picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();

    pickerInstance.setVisible(true);
  });
};

const googleDriveFetch = async (
  accessToken: string,
  input: RequestInfo | URL,
  init: RequestInit = {},
) => {
  const response = await fetch(input, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Google Drive request failed (${response.status})`);
  }

  return response;
};

export const downloadGoogleDriveFile = async (
  accessToken: string,
  file: GoogleDriveFile,
) => {
  const response = await googleDriveFetch(
    accessToken,
    `${DRIVE_API_BASE}/files/${encodeURIComponent(file.id)}?alt=media`,
  );

  return new File([await response.blob()], file.name, {
    type: file.mimeType || MIME_TYPES.excalidraw,
  });
};

export const updateGoogleDriveFile = async ({
  accessToken,
  fileId,
  serializedScene,
}: {
  accessToken: string;
  fileId: string;
  serializedScene: string;
}) => {
  await googleDriveFetch(
    accessToken,
    `${DRIVE_UPLOAD_API_BASE}/files/${encodeURIComponent(
      fileId,
    )}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": MIME_TYPES.excalidraw,
      },
      body: serializedScene,
    },
  );
};

export const createGoogleDriveFile = async ({
  accessToken,
  name,
  serializedScene,
}: {
  accessToken: string;
  name: string;
  serializedScene: string;
}): Promise<GoogleDriveFile> => {
  const metadata = {
    name: name.endsWith(EXCALIDRAW_FILE_EXTENSION)
      ? name
      : `${name}${EXCALIDRAW_FILE_EXTENSION}`,
    mimeType: MIME_TYPES.excalidraw,
  };
  const boundary = `excalidraw_${Date.now().toString(36)}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${MIME_TYPES.excalidraw}`,
    "",
    serializedScene,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  const response = await googleDriveFetch(
    accessToken,
    `${DRIVE_UPLOAD_API_BASE}/files?uploadType=multipart&fields=id,name,mimeType`,
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  return response.json();
};

export const getSceneNameFromDriveFile = (fileName: string) => {
  return fileName.endsWith(EXCALIDRAW_FILE_EXTENSION)
    ? fileName.slice(0, -EXCALIDRAW_FILE_EXTENSION.length)
    : fileName;
};
