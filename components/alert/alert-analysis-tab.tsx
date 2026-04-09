import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth/auth-context';
import { Loader2, Send, MessageSquare } from 'lucide-react';

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

interface AlertAnalysisTabProps {
  alertId: string;
  integrationId: string;
}

export function AlertAnalysisTab({ alertId, integrationId }: AlertAnalysisTabProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newAnalysis, setNewAnalysis] = useState('');

  useEffect(() => {
    fetchAnalyses();
  }, [alertId]);

  const fetchAnalyses = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/alerts/${alertId}/analyses`);
      if (!response.ok) throw new Error('Failed to fetch analyses');

      const data = await response.json();
      setAnalyses(data.analyses || []);
    } catch (error) {
      console.error('Failed to fetch analyses:', error);
      toast({
        title: 'Error',
        description: 'Failed to load analyses',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newAnalysis.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter an analysis',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`/api/alerts/${alertId}/analyses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newAnalysis,
          integrationId,
        }),
      });

      if (!response.ok) throw new Error('Failed to save analysis');

      const data = await response.json();
      setAnalyses([...analyses, data.analysis]);
      setNewAnalysis('');

      toast({
        title: 'Success',
        description: 'Analysis saved successfully',
      });
    } catch (error) {
      console.error('Failed to save analysis:', error);
      toast({
        title: 'Error',
        description: 'Failed to save analysis',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      {/* Analyses List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : analyses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No analyses yet</p>
          </div>
        ) : (
          analyses.map((analysis) => (
            <Card key={analysis.id} className="bg-muted/50">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold">
                      {analysis.authorUser?.name || analysis.author || 'Unknown'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {analysis.authorUser?.email}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(analysis.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap text-foreground">
                  {analysis.content}
                </p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Add Analysis Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Textarea
              placeholder="Enter your analysis, findings, or observations about this alert..."
              value={newAnalysis}
              onChange={(e) => setNewAnalysis(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <Button
              type="submit"
              disabled={submitting || !newAnalysis.trim()}
              className="w-full"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Save Analysis
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
