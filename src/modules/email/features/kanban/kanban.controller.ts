import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@app/libs/guards/jwt-auth.guard';
import { CurrentUser } from '@app/libs/decorators';
import { CreateColumnDto, UpdateColumnDto, MoveCardDto } from '@app/libs/dtos';
import { KanbanService } from './kanban.service';

@ApiTags('Kanban')
@Controller('kanban')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KanbanController {
  constructor(private readonly kanbanService: KanbanService) {}

  @Post('initialize')
  @ApiOperation({ summary: 'Initialize Kanban board with default columns' })
  async initializeBoard(@CurrentUser() user: { userId: string }) {
    return this.kanbanService.initializeBoard(user.userId);
  }

  @Get('board')
  @ApiOperation({ summary: 'Get full Kanban board with columns and cards' })
  async getBoard(@CurrentUser() user: { userId: string }) {
    return this.kanbanService.getBoard(user.userId);
  }

  @Post('columns')
  @ApiOperation({ summary: 'Create a new Kanban column' })
  async createColumn(
    @CurrentUser() user: { userId: string },
    @Body() data: CreateColumnDto,
  ) {
    return this.kanbanService.createColumn(user.userId, data);
  }

  @Put('columns/:columnId')
  @ApiOperation({ summary: 'Update a Kanban column' })
  async updateColumn(
    @CurrentUser() user: { userId: string },
    @Param('columnId') columnId: string,
    @Body() data: UpdateColumnDto,
  ) {
    return this.kanbanService.updateColumn(user.userId, columnId, data);
  }

  @Delete('columns/:columnId')
  @ApiOperation({ summary: 'Delete a Kanban column (moves cards to inbox)' })
  async deleteColumn(
    @CurrentUser() user: { userId: string },
    @Param('columnId') columnId: string,
  ) {
    return this.kanbanService.deleteColumn(user.userId, columnId);
  }

  @Post('cards/move')
  @ApiOperation({ summary: 'Move a card between columns (syncs with Gmail labels)' })
  async moveCard(
    @CurrentUser() user: { userId: string },
    @Body() data: MoveCardDto,
  ) {
    return this.kanbanService.moveCard(user.userId, data);
  }

  @Post('cards/add')
  @ApiOperation({ summary: 'Add an email to Kanban board' })
  async addEmail(
    @CurrentUser() user: { userId: string },
    @Body('emailId') emailId: string,
    @Body('columnId') columnId?: string,
  ) {
    return this.kanbanService.addEmail(user.userId, emailId, columnId);
  }

  @Delete('cards/:emailId')
  @ApiOperation({ summary: 'Remove an email from Kanban board' })
  async removeEmail(
    @CurrentUser() user: { userId: string },
    @Param('emailId') emailId: string,
  ) {
    return this.kanbanService.removeEmail(user.userId, emailId);
  }
}
