import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    // 验证环境变量
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('❌ Missing required environment variables');
      return new Response(JSON.stringify({ 
        error: 'Server configuration error',
        message: 'Missing required environment variables'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabaseClient = createClient(supabaseUrl, serviceRoleKey);

    console.log('⚙️ Starting comprehensive completion check for tasks (fetch + processing phases)...');

    // 1. 获取所有处于'processing'状态的任务
    const { data: pendingTasks, error: tasksError } = await supabaseClient
      .from('processing_tasks')
      .select('id, user_id, config')
      .eq('status', 'processing');

    if (tasksError) {
      console.error('❌ Error fetching pending tasks:', tasksError.message);
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch pending tasks',
        message: tasksError.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!pendingTasks || pendingTasks.length === 0) {
      console.log('✅ No pending tasks to check');
      return new Response(JSON.stringify({ 
        success: true,
        message: 'No pending tasks to check',
        totalTasks: 0,
        completedTasks: 0,
        errors: 0,
        phase_status: 'no_pending_tasks'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`🔍 Found ${pendingTasks.length} pending tasks to check`);

    let processedCount = 0;
    let errorCount = 0;

    // 检查每个待处理任务
    for (const task of pendingTasks) {
      try {
        console.log(`🔍 Checking task ${task.id}...`);
        
        // Use comprehensive completion status check instead of simple fetch job check
        const { data: completionStatus, error: statusError } = await supabaseClient
          .rpc('get_task_completion_status', { p_task_id: task.id });

        if (statusError || !completionStatus || completionStatus.length === 0) {
          console.error(`❌ Error fetching completion status for task ${task.id}:`, statusError?.message);
          errorCount++;
          continue;
        }

        const status = completionStatus[0];
        console.log(`📊 Task ${task.id} Status:`, {
          fetch: `${status.fetch_jobs_completed}/${status.fetch_jobs_total} completed, ${status.fetch_jobs_failed} failed`,
          processing: `${status.content_items_processed}/${status.content_items_total} processed, ${status.content_items_failed} failed`,
          fetchComplete: status.is_fetch_complete,
          processingComplete: status.is_processing_complete,
          overallStatus: status.overall_status
        });

        // Only trigger digest generation when BOTH fetch AND processing are complete
        if (status.is_fetch_complete && status.is_processing_complete && status.overall_status === 'complete') {
          const isPartial = status.fetch_jobs_failed > 0 || status.content_items_failed > 0;
          
          console.log(`✅ Task ${task.id} is complete (partial: ${isPartial}). Triggering digest generation...`);
          
          try {
            // 获取用户的时区设置
            const { data: userSettings } = await supabaseClient
              .from('user_settings')
              .select('auto_digest_timezone')
              .eq('user_id', task.user_id)
              .single();
            
            const userTimezone = userSettings?.auto_digest_timezone || 'UTC';
            
            const { data: invokeData, error: invokeError } = await supabaseClient.functions.invoke('generate-digest', {
              body: {
                userId: task.user_id,
                timeRange: task.config?.time_range || 'week',
                taskId: task.id,
                partial: isPartial,
                userTimezone: userTimezone,
              },
            });

            if (invokeError) {
              console.error(`❌ Failed to invoke generate-digest for task ${task.id}:`, invokeError);
              
              // 更新任务状态为失败，包含详细错误信息
              const { error: updateError } = await supabaseClient
                .from('processing_tasks')
                .update({ 
                  status: 'failed', 
                  result: { 
                    error: `Digest generation failed: ${invokeError.message}`,
                    context: invokeError.context || 'No additional context'
                  } 
                })
                .eq('id', task.id);
                
              if (updateError) {
                console.error(`❌ Failed to update task ${task.id} status to failed:`, updateError.message);
              } else {
                console.log(`✅ Task ${task.id} status updated to failed`);
              }
              
              errorCount++;
            } else {
              console.log(`✅ Successfully triggered digest generation for task ${task.id}`);
              console.log(`📄 Invoke response:`, JSON.stringify(invokeData));
              processedCount++;
            }
            
                      } catch (invokeException) {
            console.error(`❌ Exception during generate-digest invocation for task ${task.id}:`, invokeException);
            
            // Enhanced error handling with completion status context
            try {
              const errorDetails = {
                error: `Digest generation exception: ${invokeException.message}`,
                type: 'invocation_exception',
                completion_context: {
                  fetch_phase: {
                    total: status.fetch_jobs_total,
                    completed: status.fetch_jobs_completed,
                    failed: status.fetch_jobs_failed
                  },
                  processing_phase: {
                    total: status.content_items_total,
                    processed: status.content_items_processed,
                    failed: status.content_items_failed
                  },
                  overall_status: status.overall_status
                }
              };
              
              const { error: updateError } = await supabaseClient
                .from('processing_tasks')
                .update({ 
                  status: 'failed', 
                  result: errorDetails
                })
                .eq('id', task.id);
                
              if (updateError) {
                console.error(`❌ Failed to update task ${task.id} after exception:`, updateError.message);
              }
            } catch (updateException) {
              console.error(`❌ Exception while updating task ${task.id} after invoke exception:`, updateException);
            }
            
            errorCount++;
          }
          
        } else {
          // Calculate remaining work for detailed logging
          const remainingFetch = status.fetch_jobs_total - (status.fetch_jobs_completed + status.fetch_jobs_failed);
          const remainingProcessing = status.content_items_total - (status.content_items_processed + status.content_items_failed);
          
          if (!status.is_fetch_complete) {
            console.log(`⏳ Task ${task.id} still has ${remainingFetch} pending fetch jobs`);
          } else if (!status.is_processing_complete) {
            console.log(`⏳ Task ${task.id} fetch complete, but still has ${remainingProcessing} content items to process`);
          } else {
            console.log(`⏳ Task ${task.id} status: ${status.overall_status}`);
          }
        }
        
      } catch (taskError) {
        console.error(`❌ Error processing task ${task.id}:`, taskError);
        errorCount++;
      }
    }

    const summary = {
      success: true,
      totalTasks: pendingTasks.length,
      processedTasks: processedCount,
      errors: errorCount,
      message: `Comprehensive completion check: ${pendingTasks.length} tasks analyzed (fetch + processing phases), ${processedCount} ready for digest generation, ${errorCount} errors`
    };

    console.log(`📋 Comprehensive completion check summary:`, summary);

    return new Response(JSON.stringify(summary), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Critical error in check-task-completion:', error);
    
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
})
