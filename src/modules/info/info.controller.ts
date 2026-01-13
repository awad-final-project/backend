import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';

interface BuildInfo {
  version: string;
  buildTime: string;
  environment: string;
  git: {
    commit: string;
    commitShort: string;
    branch: string;
    tag: string;
    author: string;
    date: string;
    message: string;
  };
  deployment: {
    deployedAt: string;
    deployedBy: string;
  };
}

@ApiTags('System Info')
@Controller('info')
export class InfoController {
  private buildInfo: BuildInfo | null = null;

  constructor() {
    this.loadBuildInfo();
  }

  private loadBuildInfo() {
    try {
      // Try to load from build-info.json
      const buildInfoPath = path.join(process.cwd(), 'build-info.json');
      if (fs.existsSync(buildInfoPath)) {
        const data = fs.readFileSync(buildInfoPath, 'utf8');
        this.buildInfo = JSON.parse(data);
      } else {
        // Fallback to package.json version
        const packageJsonPath = path.join(process.cwd(), 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        this.buildInfo = {
          version: packageJson.version || '1.0.0',
          buildTime: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'development',
          git: {
            commit: 'unknown',
            commitShort: 'unknown',
            branch: 'unknown',
            tag: 'unknown',
            author: 'unknown',
            date: 'unknown',
            message: 'No build info available',
          },
          deployment: {
            deployedAt: new Date().toISOString(),
            deployedBy: 'unknown',
          },
        };
      }
    } catch (error) {
      console.error('Failed to load build info:', error);
      this.buildInfo = null;
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get application version and build information' })
  getInfo() {
    return {
      service: 'Email Application Backend',
      status: 'running',
      uptime: process.uptime(),
      ...this.buildInfo,
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: {
          used: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
          total: Math.round((process.memoryUsage().heapTotal / 1024 / 1024) * 100) / 100,
        },
      },
    };
  }

  @Get('version')
  @ApiOperation({ summary: 'Get application version only' })
  getVersion() {
    return {
      version: this.buildInfo?.version || 'unknown',
      buildTime: this.buildInfo?.buildTime,
      commitShort: this.buildInfo?.git?.commitShort,
      environment: this.buildInfo?.environment,
    };
  }
}
