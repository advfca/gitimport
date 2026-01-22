
export const createDriveFolder = async (accessToken: string, name: string, parentId?: string): Promise<string> => {
  const metadata = {
    name: name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : []
  };

  const response = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Erro ao criar pasta no Drive');
  return data.id;
};

export const uploadToDrive = async (accessToken: string, name: string, content: string, parentId: string): Promise<void> => {
  const metadata = {
    name: name,
    parents: [parentId]
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([content], { type: 'text/plain' }));

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    body: form
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error?.message || 'Erro ao fazer upload para o Drive');
  }
};
