import { PlansProvider, EditorProvider, TerminalProvider } from '../providers';
import { FileOperationService } from '../services/FileOperationService';
import { TemplateService } from '../services/TemplateService';
import { PromptTemplateService } from '../services/PromptTemplateService';

/**
 * Dependencies required when registering commands
 */
export interface CommandDependencies {
    plansProvider: PlansProvider;
    editorProvider: EditorProvider;
    terminalProvider: TerminalProvider;
    fileOperationService: FileOperationService;
    templateService: TemplateService;
    promptTemplateService: PromptTemplateService;
}
