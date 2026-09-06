import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import {
  type LinearComment,
  type LinearDocument,
  type LinearProject,
  linearListDocumentComments,
  linearListProjectComments,
  linearListProjectDocuments,
  linearListProjects,
} from "../lib/api-linear";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { LinearComments } from "./LinearComments";
import { MarkdownContent } from "./MarkdownContent";
import { cn } from "../lib/utils";

export const LinearProjectsSection: React.FC<{ repoPath: string }> = ({
  repoPath,
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [openDocument, setOpenDocument] = useState<LinearDocument | null>(null);

  const {
    data: projects = [],
    isLoading,
    error,
    mutate: refetch,
  } = useSWR(
    repoPath ? ["linear-projects", repoPath] : null,
    async () => await linearListProjects(repoPath),
    { revalidateOnFocus: false },
  );

  const selectedProject =
    projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null;

  const { data: documents = [], isLoading: isLoadingDocuments } = useSWR(
    repoPath && selectedProject
      ? (["linear-project-documents", repoPath, selectedProject.id] as const)
      : null,
    async ([, path, projectId]) =>
      await linearListProjectDocuments(path, projectId),
    { revalidateOnFocus: false },
  );

  const {
    data: projectComments = [],
    isLoading: isLoadingProjectComments,
    error: projectCommentsError,
  } = useSWR(
    repoPath && selectedProject
      ? (["linear-project-comments", repoPath, selectedProject.id] as const)
      : null,
    async ([, path, projectId]) =>
      await linearListProjectComments(path, projectId),
    { revalidateOnFocus: false },
  );

  return (
    <div className="flex-1 flex min-h-0" data-testid="linear-projects-section">
      <div className="w-72 shrink-0 border-r border-border flex flex-col min-h-0">
        <div className="flex items-center justify-between px-4 py-2 shrink-0">
          <span className="text-sm font-medium text-muted-foreground">
            Projects
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => void refetch()}
            title="Refresh"
            disabled={isLoading}
          >
            <RefreshCw
              className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
            />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {error !== undefined && error !== null && (
            <div className="p-4 text-sm text-destructive">
              {error instanceof Error
                ? error.message
                : "Failed to load projects"}
            </div>
          )}

          {!isLoading && !error && projects.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">
              No projects found
            </div>
          )}

          <div className="divide-y divide-border">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                data-testid={`linear-project-item-${project.id}`}
                className={cn(
                  "w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors",
                  selectedProject?.id === project.id && "bg-muted",
                )}
                onClick={() => setSelectedProjectId(project.id)}
              >
                <p className="text-sm font-medium truncate">{project.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                    {project.state}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {Math.round((project.progress || 0) * 100)}%
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {selectedProject ? (
          <ProjectDetail
            project={selectedProject}
            documents={documents}
            isLoadingDocuments={isLoadingDocuments}
            onOpenDocument={setOpenDocument}
            comments={projectComments}
            isLoadingComments={isLoadingProjectComments}
            commentsError={projectCommentsError}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Select a project
          </div>
        )}
      </div>

      <DocumentDialog
        repoPath={repoPath}
        document={openDocument}
        onClose={() => setOpenDocument(null)}
      />
    </div>
  );
};

const ProjectDetail: React.FC<{
  project: LinearProject;
  documents: LinearDocument[];
  isLoadingDocuments: boolean;
  onOpenDocument: (document: LinearDocument) => void;
  comments: LinearComment[];
  isLoadingComments: boolean;
  commentsError: unknown;
}> = ({
  project,
  documents,
  isLoadingDocuments,
  onOpenDocument,
  comments,
  isLoadingComments,
  commentsError,
}) => (
  <div className="p-4" data-testid="linear-project-detail">
    <div className="flex items-center gap-2 flex-wrap">
      <h2 className="text-lg font-semibold">{project.name}</h2>
      <a
        href={project.url}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-primary hover:underline"
      >
        Open in Linear
      </a>
    </div>
    <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground flex-wrap">
      <span className="px-1.5 py-0.5 rounded-full bg-muted capitalize">
        {project.state}
      </span>
      <span>{Math.round((project.progress || 0) * 100)}% complete</span>
      {project.lead && <span>Lead: {project.lead.name}</span>}
      {project.target_date && <span>Target: {project.target_date}</span>}
    </div>

    {project.description && (
      <div className="mt-4 pt-4 border-t border-border">
        <MarkdownContent
          content={project.description}
          className="text-sm prose-p:my-1"
        />
      </div>
    )}

    <div className="mt-6">
      <h3 className="text-sm font-medium text-muted-foreground mb-2">
        Documents
      </h3>
      {isLoadingDocuments && (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      )}
      {!isLoadingDocuments && documents.length === 0 && (
        <p className="text-sm text-muted-foreground">No documents</p>
      )}
      <div className="flex flex-wrap gap-2">
        {documents.map((doc) => (
          <button
            key={doc.id}
            type="button"
            data-testid={`linear-document-item-${doc.id}`}
            className="text-sm px-3 py-1 rounded-full bg-muted hover:bg-muted/70 text-foreground transition-colors"
            onClick={() => onOpenDocument(doc)}
          >
            {doc.title}
          </button>
        ))}
      </div>
    </div>

    <div className="mt-6">
      <h3 className="text-sm font-medium text-muted-foreground mb-2">
        Comments
      </h3>
      <LinearComments
        comments={comments}
        isLoading={isLoadingComments}
        error={commentsError}
      />
    </div>
  </div>
);

const DocumentDialog: React.FC<{
  repoPath: string;
  document: LinearDocument | null;
  onClose: () => void;
}> = ({ repoPath, document: doc, onClose }) => {
  const {
    data: comments = [],
    isLoading: isLoadingComments,
    error: commentsError,
  } = useSWR(
    repoPath && doc
      ? (["linear-document-comments", repoPath, doc.id] as const)
      : null,
    async ([, path, documentId]) =>
      await linearListDocumentComments(path, documentId),
    { revalidateOnFocus: false },
  );

  return (
    <Dialog open={doc !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{doc?.title}</DialogTitle>
        </DialogHeader>
        <MarkdownContent content={doc?.content || "No content"} />

        <div className="mt-6 pt-4 border-t border-border">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            Comments
          </h3>
          <LinearComments
            comments={comments}
            isLoading={isLoadingComments}
            error={commentsError}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
