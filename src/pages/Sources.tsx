import React, { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Plus, Edit, Trash2, Globe, Mic, FileText, Loader2, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import { sourcesApi } from '../services/api';
import { ContentSource } from '../types';
import { useToast } from '../hooks/use-toast';
import LoadingIndicator from '../components/common/LoadingIndicator';
import SourceForm from '../components/sources/SourceForm';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

const Sources = () => {
  const [sources, setSources] = useState<ContentSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSource, setEditingSource] = useState<ContentSource | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<ContentSource | null>(null);
  const [processingSources, setProcessingSources] = useState<Set<string>>(new Set());
  const [processResults, setProcessResults] = useState<{[key: string]: any}>({});
  const { toast } = useToast();

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      setLoading(true);
      const data = await sourcesApi.getSources();
      setSources(data || []);
    } catch (error) {
      console.error('Failed to load sources:', error);
      setSources([]);
      toast({
        title: "Failed to load sources",
        description: "There was an error loading your content sources.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSourceSuccess = (source: ContentSource) => {
    if (editingSource) {
      setSources(prev => (prev || []).map(s => s.id === source.id ? source : s));
    } else {
      setSources(prev => [...(prev || []), source]);
    }
    setShowForm(false);
    setEditingSource(null);
  };

  const handleEdit = (source: ContentSource) => {
    setEditingSource(source);
    setShowForm(true);
  };

  const handleDelete = async (source: ContentSource) => {
    try {
      await sourcesApi.deleteSource(source.id);
      setSources(prev => (prev || []).filter(s => s.id !== source.id));
      toast({
        title: "Source deleted",
        description: "The content source has been removed.",
      });
    } catch (error) {
      toast({
        title: "Delete failed",
        description: "There was an error deleting the source.",
        variant: "destructive",
      });
    } finally {
      setDeleteDialog(null);
    }
  };

  const toggleSourceStatus = async (source: ContentSource) => {
    try {
      const updatedSource = await sourcesApi.updateSource(source.id, {
        isActive: !source.isActive
      });
      setSources(prev => (prev || []).map(s => s.id === source.id ? updatedSource : s));
      toast({
        title: updatedSource.isActive ? "Source activated" : "Source deactivated",
        description: updatedSource.isActive 
          ? "This source will be included in future digests."
          : "This source will be excluded from future digests.",
      });
    } catch (error) {
      toast({
        title: "Update failed",
        description: "There was an error updating the source.",
        variant: "destructive",
      });
    }
  };

  // 🚀 新增：一键抓取并生成摘要功能
  const handleScrapeAndSummarize = async (source: ContentSource) => {
    const sourceId = source.id;
    setProcessingSources(prev => new Set(prev).add(sourceId));
    setProcessResults(prev => ({ ...prev, [sourceId]: null }));

    try {
      console.log('🚀 开始一键抓取并生成摘要...');
      
      const result = await sourcesApi.scrapeAndSummarize(sourceId);
      
      setProcessResults(prev => ({ ...prev, [sourceId]: result }));

      if (result.success) {
        toast({
          title: "🎉 抓取并摘要生成成功！",
          description: `成功抓取内容并生成摘要。模型：${result.data.summary.model_used}`,
        });
        
        // 刷新 sources 列表以更新 lastScraped 时间
        fetchSources();
      } else {
        toast({
          title: "❌ 处理失败",
          description: result.error || "抓取并生成摘要失败",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('一键处理失败:', error);
      setProcessResults(prev => ({ 
        ...prev, 
        [sourceId]: { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        } 
      }));
      
      toast({
        title: "❌ 处理失败",
        description: "一键抓取并生成摘要过程中发生错误",
        variant: "destructive",
      });
    } finally {
      setProcessingSources(prev => {
        const newSet = new Set(prev);
        newSet.delete(sourceId);
        return newSet;
      });
    }
  };

  const getTypeIcon = (type: ContentSource['type']) => {
    switch (type) {
      case 'podcast':
        return <Mic className="h-4 w-4" />;
      case 'blog':
        return <FileText className="h-4 w-4" />;
      case 'news':
        return <Globe className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingIndicator size="lg" text="Loading your sources..." />
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <SourceForm
            source={editingSource || undefined}
            onSuccess={handleSourceSuccess}
            onCancel={() => {
              setShowForm(false);
              setEditingSource(null);
            }}
          />
        </div>
      </div>
    );
  }

  // Ensure sources is always an array before checking length
  const sourcesArray = sources || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Content Sources</h1>
            <p className="text-gray-600 mt-2">
              Manage your blogs, podcasts, and news sources
            </p>
          </div>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Source
          </Button>
        </div>

        {/* Empty State */}
        {sourcesArray.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                <Plus className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-medium text-gray-900 mb-2">No sources yet</h3>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                Add your favorite blogs, podcasts, and news sites to start generating personalized content digests.
              </p>
              <Button onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Source
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* Sources Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sourcesArray.map((source) => (
              <Card key={source.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      {getTypeIcon(source.type)}
                      <CardTitle className="text-lg truncate">{source.name}</CardTitle>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => toggleSourceStatus(source)}
                        className={`h-2 w-2 rounded-full ${
                          source.isActive ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                        title={source.isActive ? 'Active' : 'Inactive'}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-600 truncate">{source.url}</p>
                    {source.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                        {source.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Badge variant={source.type === 'podcast' ? 'default' : 'secondary'}>
                        {source.type}
                      </Badge>
                      <Badge variant={source.isActive ? 'default' : 'secondary'}>
                        {source.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500">
                    Last scraped: {formatDate(source.lastScraped)}
                  </div>

                  {/* 处理结果显示 */}
                  {processResults[source.id] && (
                    <div className={`p-3 rounded-lg text-sm ${
                      processResults[source.id].success 
                        ? 'bg-green-50 border border-green-200' 
                        : 'bg-red-50 border border-red-200'
                    }`}>
                      {processResults[source.id].success ? (
                        <div className="flex items-start space-x-2">
                          <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                          <div>
                            <p className="font-medium text-green-800">🎉 处理成功！</p>
                            <p className="text-green-700 mt-1">
                              抓取标题：{processResults[source.id].data?.extractedContent?.title?.substring(0, 40)}...
                            </p>
                            <p className="text-green-600 mt-1">
                              摘要模型：{processResults[source.id].data?.summary?.model_used}
                            </p>
                            <p className="text-green-600 mt-1">
                              摘要长度：{processResults[source.id].data?.summary?.summary_length} 字符
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start space-x-2">
                          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                          <div>
                            <p className="font-medium text-red-800">处理失败</p>
                            <p className="text-red-700 mt-1">
                              {processResults[source.id].error}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between items-center">
                    {/* 一键处理按钮 */}
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleScrapeAndSummarize(source)}
                      disabled={processingSources.has(source.id)}
                      className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                    >
                      {processingSources.has(source.id) ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-1" />
                          Scrape & Summarize
                        </>
                      )}
                    </Button>

                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(source)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteDialog(source)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Source</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deleteDialog?.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteDialog && handleDelete(deleteDialog)}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default Sources;