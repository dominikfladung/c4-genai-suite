import { ActionIcon, Button, Portal, Table, Text } from '@mantine/core';
import { IconRestore } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { ConfigurationHistoryDto, useApi } from 'src/api';
import { ConfirmDialog, Modal } from 'src/components';
import { texts } from 'src/texts';

interface ConfigurationHistoryModalProps {
  configurationId: number;
  configurationName: string;
  onClose: () => void;
}

export function ConfigurationHistoryModal(props: ConfigurationHistoryModalProps) {
  const { configurationId, configurationName, onClose } = props;
  const api = useApi();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const perPage = 100;

  const { data: history, isLoading } = useQuery({
    queryKey: [`configuration:${configurationId}:history`],
    queryFn: () => api.extensions.getConfigurationHistory(configurationId),
  });

  const restoreMutation = useMutation({
    mutationFn: ({ version }: { version: number }) => {
      return api.extensions.restoreConfiguration(configurationId, version);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [`configuration:${configurationId}:history`] });
      void queryClient.invalidateQueries({ queryKey: ['configurations'] });
      toast.success('Configuration restored successfully');
    },
    onError: () => {
      toast.error('Failed to restore configuration. Please try again.');
    },
  });

  const handleRestore = (version: number) => {
    restoreMutation.mutate({ version });
  };

  // Pagination logic
  const startIndex = (page - 1) * perPage;
  const endIndex = startIndex + perPage;
  const paginatedHistory = history?.slice(startIndex, endIndex) || [];
  const totalPages = Math.ceil((history?.length || 0) / perPage);

  return (
    <Portal>
      <Modal
        onClose={onClose}
        header={`History - ${configurationName}`}
        size="xl"
        footer={
          <div className="flex flex-row justify-between">
            <div className="flex gap-2">
              {totalPages > 1 && (
                <Text size="sm">
                  Page {page} of {totalPages}
                </Text>
              )}
            </div>
            <div className="flex gap-2">
              {page > 1 && (
                <Button size="sm" variant="subtle" onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
              )}
              {page < totalPages && (
                <Button size="sm" variant="subtle" onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              )}
              <Button variant="subtle" onClick={onClose}>
                {texts.common.cancel}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {isLoading && <Text>Loading history...</Text>}
          {!isLoading && history && history.length === 0 && <Text>No history available</Text>}
          {!isLoading && paginatedHistory.length > 0 && (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Version</Table.Th>
                  <Table.Th>Action</Table.Th>
                  <Table.Th>Changed By</Table.Th>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Comment</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {paginatedHistory.map((item: ConfigurationHistoryDto) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>
                      <Text fw={500}>{item.version}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{item.action}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{item.changedByName || item.changedBy || 'System'}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{format(new Date(item.createdAt), 'MMM dd, yyyy HH:mm')}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {item.changeComment || '-'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <div className="flex gap-2">
                        <ConfirmDialog
                          title="Restore Configuration"
                          text={`Are you sure you want to restore to version ${item.version}?`}
                          onPerform={() => handleRestore(item.version)}
                        >
                          {({ onClick }) => (
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              onClick={onClick}
                              title="Restore this version"
                              disabled={restoreMutation.isPending}
                            >
                              <IconRestore size={16} />
                            </ActionIcon>
                          )}
                        </ConfirmDialog>
                      </div>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </div>
      </Modal>
    </Portal>
  );
}
