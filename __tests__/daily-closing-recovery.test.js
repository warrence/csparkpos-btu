import Closing from '../src/components/closing';
import {Alert} from 'react-native';
jest.mock('../src/realm',()=>({objects:()=>[{}]}));
jest.mock('../src/global',()=>({SERVER_URL:'https://fixture.invalid'}));
jest.mock('../src/printClosing',()=>jest.fn());
jest.mock('../src/printReceipt',()=>jest.fn());
jest.mock('mobx-react',()=>({inject:()=>target=>target,observer:target=>target}));
jest.mock('bugsnag-react-native',()=>({Client:jest.fn()}));
function screen(print){const view=new Closing({authStore:{userName:'FIXTURE'}});view.state={...view.state,date_to_load:'19/10/2026',printClosing:{print}};view.setState=update=>Object.assign(view.state,update);return view;}
beforeEach(()=>jest.spyOn(Alert,'alert').mockImplementation(()=>{}));
afterEach(()=>{jest.restoreAllMocks();jest.useRealTimers();});
test('synchronous formatter exception unlocks spinner and reports failure, never completion',async()=>{
 const print=jest.fn(()=>{throw Error('Synthetic formatting error');}),view=screen(print);await view.onLoadButtonPress();
 expect(view.state.isLoading).toBe(false);expect(view._closing).toBe(false);expect(print).toHaveBeenCalledTimes(1);
 expect(Alert.alert).toHaveBeenCalledWith('Daily Closing print failed',expect.stringContaining('Saved receipts are unchanged'));
 expect(Alert.alert).not.toHaveBeenCalledWith('Daily Closing Completed');
});
test('await printer once; rapid taps cannot duplicate print; confirm only after acceptance',async()=>{
 let finish;const print=jest.fn(()=>new Promise(resolve=>{finish=resolve;})),view=screen(print);
 const pending=view.onLoadButtonPress();await Promise.resolve();await view.onLoadButtonPress();
 expect(print).toHaveBeenCalledTimes(1);expect(view.state.isLoading).toBe(true);expect(Alert.alert).not.toHaveBeenCalled();
 finish(true);await pending;expect(view.state.isLoading).toBe(false);expect(Alert.alert).toHaveBeenCalledWith('Daily Closing Completed');
});
test.each([false,'reject'])('printer failure %s clears spinner without success',async mode=>{
 const view=screen(jest.fn(()=>mode==='reject'?Promise.reject(Error('Disconnected')):Promise.resolve(false)));
 await view.onLoadButtonPress();expect(view.state.isLoading).toBe(false);expect(Alert.alert).toHaveBeenCalledWith('Daily Closing print failed',expect.any(String));
});
test('hung printer has bounded wait, no automatic retry, and uncertain-output warning',async()=>{
 jest.useFakeTimers();const print=jest.fn(()=>new Promise(()=>{})),view=screen(print);const pending=view.onLoadButtonPress();await Promise.resolve();
 jest.advanceTimersByTime(15000);await pending;expect(view.state.isLoading).toBe(false);expect(print).toHaveBeenCalledTimes(1);
 expect(Alert.alert).toHaveBeenCalledWith('Daily Closing print failed',expect.stringContaining('may already have printed'));
});
test('invalid closing date never prints',async()=>{const print=jest.fn(),view=screen(print);view.state.date_to_load='31/02/2026';await view.onLoadButtonPress();expect(print).not.toHaveBeenCalled();});
