// Background task de iOS para los envíos de analytics del popup-sdk (DD-55).
//
// iOS suspende la app pocos segundos después de pasar a background; si el POST con el cierre de
// la sesión sigue en vuelo, no termina hasta que el usuario vuelve a abrir la app. Este módulo
// pide ese tiempo extra (`beginBackgroundTaskWithName`) mientras dura cada envío. Lo enlaza solo
// el autolinking de React Native (`pod install`); el host no escribe código. Sin él, el SDK
// funciona igual que antes (el cierre se guarda y se reenvía en el arranque siguiente).
//
// Cada tarea la identifica un token que genera el JS: `begin(token, name)` y `end(token)`.
// Los métodos van en la cola serie del módulo, así que un `end` nunca adelanta a su `begin`.

#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

@interface DeepdotsBackgroundTask : NSObject <RCTBridgeModule>
@end

@implementation DeepdotsBackgroundTask {
  NSMutableDictionary<NSString *, NSNumber *> *_tasks;
}

RCT_EXPORT_MODULE(DeepdotsBackgroundTask)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  if (self = [super init]) {
    _tasks = [NSMutableDictionary new];
  }
  return self;
}

RCT_EXPORT_METHOD(begin:(NSString *)token name:(NSString *)name)
{
  __weak DeepdotsBackgroundTask *weakSelf = self;
  UIBackgroundTaskIdentifier taskId =
      [[UIApplication sharedApplication] beginBackgroundTaskWithName:name
                                                   expirationHandler:^{
                                                     // iOS agota el tiempo antes de que el envío termine.
                                                     [weakSelf endToken:token];
                                                   }];
  if (taskId == UIBackgroundTaskInvalid) {
    return;
  }
  @synchronized(self) {
    _tasks[token] = @(taskId);
  }
}

RCT_EXPORT_METHOD(end:(NSString *)token)
{
  [self endToken:token];
}

- (void)endToken:(NSString *)token
{
  NSNumber *taskId;
  @synchronized(self) {
    taskId = _tasks[token];
    [_tasks removeObjectForKey:token];
  }
  if (taskId != nil) {
    [[UIApplication sharedApplication] endBackgroundTask:taskId.unsignedIntegerValue];
  }
}

@end
