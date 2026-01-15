import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigurationEntity, ConfigurationStatus } from 'src/domain/database';
import { ExplorerService } from '../services';
import { ExportConfigurationHandler } from './export-configuration';

describe('ExportConfigurationHandler', () => {
  let handler: ExportConfigurationHandler;
  let configurationRepository: Repository<ConfigurationEntity>;
  let explorerService: ExplorerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportConfigurationHandler,
        {
          provide: getRepositoryToken(ConfigurationEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: ExplorerService,
          useValue: {
            getExtension: jest.fn(),
          },
        },
      ],
    }).compile();

    handler = module.get<ExportConfigurationHandler>(ExportConfigurationHandler);
    configurationRepository = module.get<Repository<ConfigurationEntity>>(getRepositoryToken(ConfigurationEntity));
    explorerService = module.get<ExplorerService>(ExplorerService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('should throw NotFoundException when configuration is not found', async () => {
    jest.spyOn(configurationRepository, 'findOne').mockResolvedValue(null);

    await expect(handler.execute({ id: 999 })).rejects.toThrow(NotFoundException);
  });

  it('should export configuration without extensions', async () => {
    const mockConfig: Partial<ConfigurationEntity> = {
      id: 1,
      name: 'Test Config',
      description: 'Test Description',
      status: ConfigurationStatus.ENABLED,
      agentName: 'Test Agent',
      userGroupIds: ['group1'],
      extensions: [],
    };

    jest.spyOn(configurationRepository, 'findOne').mockResolvedValue(mockConfig as ConfigurationEntity);

    const result = await handler.execute({ id: 1 });

    expect(result.data).toBeDefined();
    expect(result.data.name).toBe('Test Config');
    expect(result.data.description).toBe('Test Description');
    expect(result.data.enabled).toBe(true);
    expect(result.data.agentName).toBe('Test Agent');
    expect(result.data.userGroupIds).toEqual(['group1']);
    expect(result.data.version).toBeDefined();
    expect(result.data.exportedAt).toBeDefined();
  });

  it('should log error when export fails', async () => {
    const loggerErrorSpy = jest.spyOn(handler['logger'], 'error');
    jest.spyOn(configurationRepository, 'findOne').mockRejectedValue(new Error('Database error'));

    await expect(handler.execute({ id: 1 })).rejects.toThrow('Database error');
    expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to export configuration'), expect.any(String));
  });
});
