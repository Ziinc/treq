import { PlanSection } from '../types/planning';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Copy, CheckCircle2, ListTodo, Lightbulb, FileText, Edit3, Play } from 'lucide-react';
import { useToast } from './ui/toast';
import { PlanEditor } from './PlanEditor';

interface PlanDisplayProps {
  planSections: PlanSection[];
  onPlanEdit?: (planId: string, newContent: string) => void;
  onExecutePlan?: (section: PlanSection) => void;
}

const getTypeColor = (type: PlanSection['type']) => {
  switch (type) {
    case 'plan':
      return 'border-l-blue-500 bg-blue-500/5';
    case 'implementation_plan':
      return 'border-l-green-500 bg-green-500/5';
    case 'tasks':
      return 'border-l-orange-500 bg-orange-500/5';
    case 'suggestions':
      return 'border-l-purple-500 bg-purple-500/5';
    default:
      return 'border-l-gray-500 bg-gray-500/5';
  }
};

const getTypeIcon = (type: PlanSection['type']) => {
  switch (type) {
    case 'plan':
      return <FileText className="w-4 h-4" />;
    case 'implementation_plan':
      return <CheckCircle2 className="w-4 h-4" />;
    case 'tasks':
      return <ListTodo className="w-4 h-4" />;
    case 'suggestions':
      return <Lightbulb className="w-4 h-4" />;
    default:
      return <FileText className="w-4 h-4" />;
  }
};

const getTypeBadgeColor = (type: PlanSection['type']) => {
  switch (type) {
    case 'plan':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    case 'implementation_plan':
      return 'bg-green-500/10 text-green-500 border-green-500/20';
    case 'tasks':
      return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
    case 'suggestions':
      return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
    default:
      return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
  }
};

const formatRelativeTime = (date: Date): string => {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) {
    return 'just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
};

export const PlanDisplay: React.FC<PlanDisplayProps> = ({ planSections, onPlanEdit, onExecutePlan }) => {
  const { addToast } = useToast();

  const handleCopySection = (section: PlanSection) => {
    const content = section.editedContent || section.rawMarkdown || `${section.title}\n\n${section.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`;
    navigator.clipboard.writeText(content);
    addToast({
      title: 'Copied',
      description: 'Plan section copied to clipboard',
      type: 'success',
    });
  };

  const handleEditorChange = (planId: string, newContent: string) => {
    if (onPlanEdit) {
      onPlanEdit(planId, newContent);
    }
  };

  const handleExecute = (section: PlanSection) => {
    if (onExecutePlan) {
      onExecutePlan(section);
    }
  };

  if (planSections.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-center">
        <div className="max-w-md">
          <Lightbulb className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No plans detected yet</h3>
          <p className="text-sm text-muted-foreground">
            Start planning in the terminal. Plans will appear here automatically
            when detected in the output.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {planSections.map((section) => (
        <Card
          key={section.id}
          className={`border-l-4 ${getTypeColor(section.type)} transition-all hover:shadow-md`}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 flex-1">
                <div className="mt-1">
                  {getTypeIcon(section.type)}
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base font-semibold">
                    {section.title}
                  </CardTitle>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${getTypeBadgeColor(section.type)}`}
                    >
                      {section.type.replace('_', ' ')}
                    </span>
                    {section.isEdited && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border bg-amber-500/10 text-amber-500 border-amber-500/20">
                        <Edit3 className="w-3 h-3" />
                        Edited
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(section.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {section.type === 'implementation_plan' && onExecutePlan && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleExecute(section)}
                    className="h-8"
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Execute
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleCopySection(section)}
                  className="h-8 w-8"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {section.scope && (
              <div className="mb-4 p-3 bg-muted/50 rounded-md">
                <p className="text-sm font-medium text-muted-foreground mb-1">Scope:</p>
                <p className="text-sm">{section.scope}</p>
              </div>
            )}
            <PlanEditor
              content={section.editedContent || section.rawMarkdown}
              onChange={(newContent) => handleEditorChange(section.id, newContent)}
              height="300px"
              readOnly={!onPlanEdit}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

