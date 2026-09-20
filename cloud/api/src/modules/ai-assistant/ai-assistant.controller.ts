import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { PlatformUser } from '@prisma/client';
import { AiAssistantService } from './ai-assistant.service';
import { updateQuestionSchema, updateSettingsSchema, createQuestionSchema, restaurantAiAccessSchema } from './dto/ai-assistant.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformAuthGuard } from '../../common/guards/platform-auth.guard';
import { CurrentPlatformUser } from '../../common/decorators/current-platform-user.decorator';

@Controller('api/v1/ai-assistant')
@UseGuards(PlatformAuthGuard)
export class AiAssistantController {
  constructor(private readonly aiAssistant: AiAssistantService) {}

  @Get('config')
  getConfig() {
    return this.aiAssistant.getConfig();
  }

  @Get('restaurants/:id/access')
  getRestaurantAccess(@Param('id') id: string) {
    return this.aiAssistant.getRestaurantAccess(id);
  }

  @Patch('restaurants/:id/access')
  @UsePipes(new ZodValidationPipe(restaurantAiAccessSchema))
  setRestaurantAccess(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof restaurantAiAccessSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.aiAssistant.setRestaurantAccess(id, body, actor);
  }

  @Patch('questions/:id')
  @UsePipes(new ZodValidationPipe(updateQuestionSchema))
  updateQuestion(
    @Param('id') id: string,
    @Body() body: ReturnType<typeof updateQuestionSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.aiAssistant.updateQuestion(id, body, actor);
  }

  @Patch('settings')
  @UsePipes(new ZodValidationPipe(updateSettingsSchema))
  updateSettings(
    @Body() body: ReturnType<typeof updateSettingsSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.aiAssistant.updateSettings(body, actor);
  }

  @Post('questions')
  @UsePipes(new ZodValidationPipe(createQuestionSchema))
  createQuestion(
    @Body() body: ReturnType<typeof createQuestionSchema.parse>,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.aiAssistant.addQuestion(body, actor);
  }

  @Delete('questions/:id')
  deleteQuestion(
    @Param('id') id: string,
    @CurrentPlatformUser() actor: PlatformUser
  ) {
    return this.aiAssistant.deleteQuestion(id, actor);
  }
}
