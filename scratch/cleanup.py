import os

def fix_student():
    path = r'c:\Users\jcalv\Downloads\AttenEase Proto0.1\Resource\studentDashboard.html'
    with open(path, 'rb') as f:
        content = f.read()
    
    # Target the block of dangling braces and the garbage showToast
    # We'll use a byte search for parts we know
    # Line 876: } (0x7D)
    # Line 883: showToast('...
    
    # Looking at the view_file, there's a big gap.
    # I'll find 'recordWithLocation(null);\n            }\n        }'
    # and "async function refreshAttendanceSummary()"
    # and remove everything in between.
    
    start_marker = b'recordWithLocation(null);\r\n            }\r\n        }'
    end_marker = b'async function refreshAttendanceSummary()'
    
    start_idx = content.find(start_marker)
    if start_idx == -1:
        start_marker = b'recordWithLocation(null);\n            }\n        }'
        start_idx = content.find(start_marker)
        
    end_idx = content.find(end_marker)
    
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        new_content = content[:start_idx + len(start_marker)] + b'\n\n        ' + content[end_idx:]
        with open(path, 'wb') as f:
            f.write(new_content)
        print("Fixed studentDashboard.html")
    else:
        print(f"Markers not found in student: {start_idx}, {end_idx}")

def fix_teacher():
    path = r'c:\Users\jcalv\Downloads\AttenEase Proto0.1\Resource\teacherDashboard.html'
    with open(path, 'rb') as f:
        content = f.read()
    
    # We want to remove the redundant duplicate if/if block
    # It starts after a closing brace for location check
    # Let's find: 'changed = true;\r\n                                }\r\n                            }\r\n                        }'
    
    target = b'if (sr.timeOut && sr.timeOut !== local.timeOut) { local.timeOut = sr.timeOut; changed = true; }'
    
    # We find the second occurrence if it exists, or the one that is dangling
    # Actually, the dangling one is at line 2690
    
    # I'll just find the exact sequence from the user's report
    dangling = b'if (sr.timeOut && sr.timeOut !== local.timeOut) { local.timeOut = sr.timeOut; changed = true; }\r\n                            if (sr.status  && sr.status  !== local.status)  { local.status  = sr.status;  changed = true; }\r\n                        }'
    if content.find(dangling) == -1:
         dangling = b'if (sr.timeOut && sr.timeOut !== local.timeOut) { local.timeOut = sr.timeOut; changed = true; }\n                            if (sr.status  && sr.status  !== local.status)  { local.status  = sr.status;  changed = true; }\n                        }'

    if content.find(dangling) != -1:
        new_content = content.replace(dangling, b'')
        with open(path, 'wb') as f:
            f.write(new_content)
        print("Fixed teacherDashboard.html")
    else:
        print("Dangling block not found in teacher")

fix_student()
fix_teacher()
