import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MessageSquare } from 'lucide-react';

interface Analysis {
  id: string;
  content: string;
  author: string;
  authorId: string;
  createdAt: string;
  authorUser?: {
    id: string;
    email: string;
    name: string;
  };
}

interface AlertAnalysisSectionProps {
  alertId: string;
  integrationId: string;
  refreshTrigger?: number; // Pass a new number to trigger refetch
}

export function AlertAnalysisSection({ alertId, integrationId, refreshTrigger }: AlertAnalysisSectionProps) {
  const { toast } = useToast();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalyses();
  }, [alertId, refreshTrigger]); // Refetch when alertId or refreshTrigger changes

  const fetchAnalyses = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/alerts/${alertId}/analyses`);
      if (!response.ok) throw new Error('Failed to fetch analyses');

      const data = await response.json();
      setAnalyses(data.analyses || []);
    } catch (error) {
      console.error('Failed to fetch analyses:', error);
      // Don't show toast on error, just silently fail
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Analysis & Findings</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (analyses.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Analysis & Findings ({analyses.length})
        </CardTitle>
        <CardDescription>Historical analyses added during status updates</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {analyses.map((analysis) => (
          <div
            key={analysis.id}
            className="border border-border rounded-lg p-3 bg-muted/50 space-y-2"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold">
                  {analysis.authorUser?.name || analysis.author || 'Unknown'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {analysis.authorUser?.email}
                </span>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(analysis.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap text-foreground">
              {analysis.content}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
