import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigurationEntity, ExtensionEntity, UserGroupEntity } from 'src/domain/database';
import { ExplorerService } from '../services';
import { ImportConfigurationHandler } from './import-configuration';

describe('ImportConfigurationHandler', () => {
  let handler: ImportConfigurationHandler;
  let configurationRepository: Repository<ConfigurationEntity>;
  let extensionRepository: Repository<ExtensionEntity>;
  let userGroupRepository: Repository<UserGroupEntity>;
  let explorerService: ExplorerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportConfigurationHandler,
        {
          provide: getRepositoryToken(ConfigurationEntity),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ExtensionEntity),
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserGroupEntity),
          useValue: {
            findBy: jest.fn(),
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

    handler = module.get<ImportConfigurationHandler>(ImportConfigurationHandler);
    configurationRepository = module.get<Repository<ConfigurationEntity>>(getRepositoryToken(ConfigurationEntity));
    extensionRepository = module.get<Repository<ExtensionEntity>>(getRepositoryToken(ExtensionEntity));
    userGroupRepository = module.get<Repository<UserGroupEntity>>(getRepositoryToken(UserGroupEntity));
    explorerService = module.get<ExplorerService>(ExplorerService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  it('should throw BadRequestException when name is missing', async () => {
    const data = {
      name: '',
      description: 'Test',
      enabled: true,
    };

    await expect(handler.execute({ data })).rejects.toThrow(BadRequestException);
  });

  it('should import configuration successfully', async () => {
    const data = {
      name: 'Imported Config',
      description: 'Imported Description',
      enabled: true,
      agentName: 'Test Agent',
      userGroupIds: [],
      extensions: [],
    };

    const mockCreatedConfig = {
      id: 1,
      ...data,
    };

    jest.spyOn(configurationRepository, 'create').mockReturnValue(mockCreatedConfig as any);
    jest.spyOn(configurationRepository, 'save').mockResolvedValue(mockCreatedConfig as any);

    const result = await handler.execute({ data });

    expect(result.configuration).toBeDefined();
    expect(configurationRepository.create).toHaveBeenCalled();
    expect(configurationRepository.save).toHaveBeenCalled();
  });

  it('should throw BadRequestException when extension does not exist', async () => {
    const data = {
      name: 'Test Config',
      description: 'Test',
      enabled: true,
      extensions: [
        {
          name: 'NonExistentExtension',
          enabled: true,
          values: {},
        },
      ],
    };

    jest.spyOn(configurationRepository, 'create').mockReturnValue({} as any);
    jest.spyOn(explorerService, 'getExtension').mockReturnValue(undefined);

    await expect(handler.execute({ data })).rejects.toThrow(BadRequestException);
  });
});
