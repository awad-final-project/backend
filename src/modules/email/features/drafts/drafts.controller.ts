import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@app/libs/guards/jwt-auth.guard';
import { CurrentUser } from '@app/libs/decorators';
import { DraftsService, CreateDraftDto, UpdateDraftDto } from './drafts.service';

@Controller('email/drafts')
@UseGuards(JwtAuthGuard)
export class DraftsController {
  constructor(private readonly draftsService: DraftsService) {}

  @Post()
  async createDraft(
    @CurrentUser() user: any,
    @Body() createDraftDto: CreateDraftDto,
  ) {
    return this.draftsService.createDraft(user.sub, createDraftDto);
  }

  @Get()
  async getDrafts(@CurrentUser() user: any) {
    return this.draftsService.getDrafts(user.sub);
  }

  @Get(':id')
  async getDraft(@CurrentUser() user: any, @Param('id') id: string) {
    return this.draftsService.getDraft(user.sub, id);
  }

  @Put(':id')
  async updateDraft(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDraftDto: UpdateDraftDto,
  ) {
    return this.draftsService.updateDraft(user.sub, id, updateDraftDto);
  }

  @Delete(':id')
  async deleteDraft(@CurrentUser() user: any, @Param('id') id: string) {
    await this.draftsService.deleteDraft(user.sub, id);
    return { success: true };
  }
}
