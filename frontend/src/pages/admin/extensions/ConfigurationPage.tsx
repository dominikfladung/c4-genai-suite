import { useMutation, useQuery } from '@tanstack/react-query';
import { IconUpload } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Route, Routes } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ConfigurationDto, useApi } from 'src/api';
import { Icon, Page } from 'src/components';
import { useEventCallback, useTransientNavigate } from 'src/hooks';
import { buildError } from 'src/lib';
import { texts } from 'src/texts';
import { Configuration } from './Configuration.tsx';
import { EmptyPage } from './EmptyPage';
import { ExtensionsPage } from './ExtensionsPage';
import { UpsertConfigurationDialog } from './UpsertConfigurationDialog.tsx';
import { useConfigurationStore } from './state';

export function ConfigurationPage() {
  const api = useApi();
  const { i18n } = useTranslation();

  const navigate = useTransientNavigate();
  const [toCreate, setToCreate] = useState<boolean>();
  const [toUpdate, setToUpdate] = useState<ConfigurationDto | null>(null);
  const { configurations, removeConfiguration, setConfiguration, setConfigurations } = useConfigurationStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: loadedConfigurations, isFetched } = useQuery({
    queryKey: [`configurations_${i18n.language}`],
    queryFn: () => api.extensions.getConfigurations(),
  });

  useEffect(() => {
    if (loadedConfigurations) {
      setConfigurations(loadedConfigurations.items);
    }
  }, [loadedConfigurations, setConfigurations]);

  const deleting = useMutation({
    mutationFn: (configuration: ConfigurationDto) => {
      return api.extensions.deleteConfiguration(configuration.id);
    },
    onSuccess: (_, configuration) => {
      removeConfiguration(configuration.id);
      navigate('/admin/assistants/');
    },
    onError: async (error) => {
      toast.error(await buildError(texts.extensions.removeConfigurationFailed, error));
    },
  });

  const duplicate = useMutation({
    mutationFn: (configuration: ConfigurationDto) => {
      return api.extensions.duplicateConfiguration(configuration.id);
    },
    onSuccess: (configuration) => {
      setConfiguration(configuration);
      navigate(`/admin/assistants/${configuration.id}`);
    },
    onError: async (error) => {
      toast.error(await buildError(texts.extensions.duplicateConfigurationFailed, error));
    },
  });

  const exportConfig = useMutation({
    mutationFn: async (configuration: ConfigurationDto) => {
      const data = await api.extensions.exportConfiguration(configuration.id);
      // Create blob and trigger download
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // Sanitize filename: keep letters, numbers, hyphens, underscores, and spaces
      const sanitizedName = configuration.name.replace(/[^a-zA-Z0-9\-_ ]/g, '_').toLowerCase();
      link.download = `${sanitizedName}_config.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast.success(texts.extensions.exportConfigurationSuccess);
    },
    onError: async (error) => {
      toast.error(await buildError(texts.extensions.exportConfigurationFailed, error));
    },
  });

  const importConfig = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      try {
        const data = JSON.parse(text);
        return api.extensions.importConfiguration(data);
      } catch (error) {
        throw new Error('Invalid JSON file. Please upload a valid configuration file.');
      }
    },
    onSuccess: (configuration) => {
      setConfiguration(configuration);
      toast.success(texts.extensions.importConfigurationSuccess);
      navigate(`/admin/assistants/${configuration.id}`);
    },
    onError: async (error) => {
      toast.error(await buildError(texts.extensions.importConfigurationFailed, error));
    },
  });

  const handleImport = useEventCallback(() => {
    fileInputRef.current?.click();
  });

  const handleFileChange = useEventCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      importConfig.mutate(file);
      // Reset input so the same file can be selected again
      event.target.value = '';
    }
  });

  const doCreate = useEventCallback((configuration: ConfigurationDto) => {
    setConfiguration(configuration);
    navigate(`/admin/assistants/${configuration.id}`);
  });

  const doClose = useEventCallback(() => {
    setToUpdate(null);
    setToCreate(false);
  });

  return (
    <Page
      menu={
        <div className="flex flex-col overflow-y-hidden">
          <div className="flex p-8 pb-4">
            <h3 id={texts.extensions.configurations} className="grow text-xl">
              {texts.extensions.configurations}
            </h3>

            <button className="btn btn-square btn-sm mr-2 text-sm" onClick={handleImport} title={texts.common.import}>
              <IconUpload size={16} />
            </button>
            <button className="btn btn-square btn-sm text-sm" onClick={() => setToCreate(true)}>
              <Icon icon="plus" size={16} />
            </button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} style={{ display: 'none' }} />
          </div>

          <div className="grow overflow-y-auto p-4 pt-4">
            <div aria-labelledby={texts.extensions.configurations} className="nav-menu flex flex-col">
              {configurations.map((configuration) => (
                <Configuration
                  key={configuration.id}
                  configuration={configuration}
                  onDelete={deleting.mutate}
                  onUpdate={setToUpdate}
                  onDuplicate={duplicate.mutate}
                  onExport={exportConfig.mutate}
                />
              ))}
            </div>

            {configurations.length === 0 && isFetched && (
              <div className="pt-4 text-sm text-gray-400">{texts.extensions.configurationsEmpty}</div>
            )}
          </div>
        </div>
      }
    >
      <Routes>
        <Route path=":id" element={<ExtensionsPage />} />
        <Route path="" element={<EmptyPage />} />
      </Routes>

      {(toCreate || toUpdate) && (
        <UpsertConfigurationDialog onClose={doClose} onCreate={doCreate} onUpdate={setConfiguration} target={toUpdate} />
      )}
    </Page>
  );
}
