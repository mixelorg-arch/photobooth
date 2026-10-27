#!/usr/bin/env python3
"""Generate Photobooth.xcodeproj from whatever is in PhotoboothApp/.

The project file is generated rather than checked in half-edited, so re-run
this after adding or removing a source file — it rescans the tree and rewrites
the project. (It was first written on a machine believed to have no Xcode;
that turned out to be wrong, but generating it is still right, because a
hand-edit made in Xcode would be overwritten the next time this runs.)

Object identifiers are md5-derived from a stable key, so regenerating an
unchanged tree produces a byte-identical project (no spurious git diffs).
"""

import hashlib
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SOURCE_DIR = "PhotoboothApp"
PROJECT_NAME = "Photobooth"
# Universal now, so the identifier no longer says iPad.
BUNDLE_ID = "com.seanamador.photobooth.kiosk"
DEPLOYMENT_TARGET = "17.0"
SWIFT_VERSION = "5.0"

# Files that are compiled, and files that are copied into the bundle.
SOURCE_EXT = {".swift"}
RESOURCE_NAMES = {"Assets.xcassets"}

# Directories copied into the bundle whole, keeping their structure.
#
# `web/` is the booth itself — the same files served at
# mixelorg-arch.github.io/photobooth — and it has to stay a *folder*
# reference rather than a group: booth.js, sw.js, the icons and the service
# worker's cache list all address each other by relative path, and a group
# would flatten every one of them into the bundle root.
FOLDER_RESOURCES = ["web"]


def oid(key):
    return hashlib.md5(key.encode()).hexdigest()[:24].upper()


def scan():
    """Returns (groups, sources, resources) with paths relative to ROOT."""
    sources, resources = [], []
    for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, SOURCE_DIR)):
        rel_dir = os.path.relpath(dirpath, ROOT)
        # Asset catalogs are bundles: take the whole directory, do not walk in.
        for name in list(dirnames):
            if name in RESOURCE_NAMES:
                resources.append(os.path.join(rel_dir, name))
                dirnames.remove(name)
        dirnames.sort()
        for name in sorted(filenames):
            if os.path.splitext(name)[1] in SOURCE_EXT:
                sources.append(os.path.join(rel_dir, name))
    for folder in FOLDER_RESOURCES:
        if os.path.isdir(os.path.join(ROOT, folder)):
            resources.append(folder)
    return sorted(sources), sorted(resources)


def file_type(path):
    ext = os.path.splitext(path)[1]
    return {
        ".swift": "sourcecode.swift",
        ".plist": "text.plist.xml",
        ".xcassets": "folder.assetcatalog",
        # No extension and a real directory: a folder reference, which Xcode
        # copies in wholesale instead of descending into.
        "": "folder" if os.path.isdir(os.path.join(ROOT, path)) else "text",
    }.get(ext, "text")


def build_tree(paths):
    """Nest relative paths into a dict tree keyed by directory name."""
    tree = {}
    for path in paths:
        parts = path.split(os.sep)
        node = tree
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node[parts[-1]] = path
    return tree


def emit_groups(name, node, lines, path_prefix=""):
    """Depth-first; returns this group's object id."""
    children = []
    for key in sorted(node):
        value = node[key]
        if isinstance(value, dict):
            children.append(emit_groups(key, value, lines, path_prefix + key + "/"))
        else:
            children.append(oid("file:" + value))

    gid = oid("group:" + path_prefix + name)
    child_lines = "\n".join("\t\t\t\t%s," % c for c in children)
    lines.append(
        "\t\t{gid} /* {name} */ = {{\n"
        "\t\t\tisa = PBXGroup;\n"
        "\t\t\tchildren = (\n{children}\n\t\t\t);\n"
        "\t\t\tpath = {name};\n"
        "\t\t\tsourceTree = \"<group>\";\n"
        "\t\t}};".format(gid=gid, name=name, children=child_lines)
    )
    return gid


def development_team():
    """The Apple Developer team id to sign with, or None.

    Baking this in saves a trip through Signing & Capabilities after every
    regeneration: the project file is generated here, so a team picked in
    Xcode's UI would be overwritten the next time this script runs.

    A free "Personal Team" signs exactly like a paid one — it is the
    seven-day expiry that differs, not the signing. Returns None until an
    Apple ID has been added to Xcode, which leaves the project unsigned:
    still fine for the simulator, and only a device build needs an account.
    """
    override = os.environ.get("DEVELOPMENT_TEAM", "").strip()
    if override:
        return override

    # Xcode records every team it knows under this key, keyed by Apple ID.
    try:
        raw = subprocess.run(
            ["defaults", "read", "com.apple.dt.Xcode", "IDEProvisioningTeams"],
            capture_output=True, text=True, timeout=10).stdout
    except (OSError, subprocess.SubprocessError):
        return None

    # That value is an old-style plist, not JSON. A team id is the only
    # 10-character uppercase-alphanumeric field in it, so match that rather
    # than carry a plist parser around for one string.
    found = re.findall(r'teamID\s*=\s*"?([A-Z0-9]{10})"?', raw)
    if found:
        return found[0]

    return _team_from_certificate()


def _team_from_certificate():
    """The team id read off an installed Apple Development certificate.

    Xcode only fills in IDEProvisioningTeams once it has provisioned a
    device, but it issues the signing certificate as soon as a team is
    chosen — so between those two moments the certificate is the only place
    the team id exists. That gap is exactly when someone is trying to get
    their first device build out, so it is worth closing.

    The id is the certificate's **OU**. Neither of the other two identifiers
    in the subject is the team: CN carries the certificate id and UID the
    user id, and both are easy to grab by mistake.
    """
    try:
        listing = subprocess.run(
            ["security", "find-identity", "-v", "-p", "codesigning"],
            capture_output=True, text=True, timeout=10).stdout
    except (OSError, subprocess.SubprocessError):
        return None

    for name in re.findall(r'"(Apple Develop(?:ment|er)[^"]*)"', listing):
        try:
            pem = subprocess.run(["security", "find-certificate", "-c", name, "-p"],
                                 capture_output=True, text=True, timeout=10).stdout
            subject = subprocess.run(["openssl", "x509", "-noout", "-subject"],
                                     input=pem, capture_output=True, text=True,
                                     timeout=10).stdout
        except (OSError, subprocess.SubprocessError):
            continue
        ou = re.search(r'OU\s*=\s*([A-Z0-9]{10})', subject)
        if ou:
            return ou.group(1)
    return None


def generate():
    sources, resources = scan()
    if not sources:
        sys.exit("No Swift files found under %s/" % SOURCE_DIR)

    plist = os.path.join(SOURCE_DIR, "App", "Info.plist")
    all_files = sources + resources + [plist]

    ids = {
        "project": oid("project"),
        "target": oid("target"),
        "product": oid("product"),
        "products_group": oid("group:Products"),
        "sources_phase": oid("phase:sources"),
        "frameworks_phase": oid("phase:frameworks"),
        "resources_phase": oid("phase:resources"),
        "target_config_list": oid("configlist:target"),
        "project_config_list": oid("configlist:project"),
        "target_debug": oid("config:target:Debug"),
        "target_release": oid("config:target:Release"),
        "project_debug": oid("config:project:Debug"),
        "project_release": oid("config:project:Release"),
    }

    out = ["// !$*UTF8*$!", "{",
           "\tarchiveVersion = 1;",
           "\tclasses = {\n\t};",
           "\tobjectVersion = 56;",
           "\tobjects = {"]

    # PBXBuildFile
    out.append("\n/* Begin PBXBuildFile section */")
    for path in sources + resources:
        out.append("\t\t{bid} /* {name} in Build */ = {{isa = PBXBuildFile; "
                   "fileRef = {fid}; }};".format(
                       bid=oid("build:" + path),
                       name=os.path.basename(path),
                       fid=oid("file:" + path)))
    out.append("/* End PBXBuildFile section */")

    # PBXFileReference
    out.append("\n/* Begin PBXFileReference section */")
    for path in all_files:
        out.append("\t\t{fid} /* {name} */ = {{isa = PBXFileReference; "
                   "lastKnownFileType = {ftype}; path = {name}; "
                   "sourceTree = \"<group>\"; }};".format(
                       fid=oid("file:" + path),
                       name=os.path.basename(path),
                       ftype=file_type(path)))
    out.append("\t\t{pid} /* {app}.app */ = {{isa = PBXFileReference; "
               "explicitFileType = wrapper.application; includeInIndex = 0; "
               "path = {app}.app; sourceTree = BUILT_PRODUCTS_DIR; }};".format(
                   pid=ids["product"], app=PROJECT_NAME))
    out.append("/* End PBXFileReference section */")

    # PBXGroup
    out.append("\n/* Begin PBXGroup section */")
    group_lines = []
    tree = build_tree(all_files)
    app_group = emit_groups(SOURCE_DIR, tree[SOURCE_DIR], group_lines)
    out.extend(group_lines)

    out.append("\t\t{gid} /* Products */ = {{\n"
               "\t\t\tisa = PBXGroup;\n"
               "\t\t\tchildren = (\n\t\t\t\t{pid},\n\t\t\t);\n"
               "\t\t\tname = Products;\n"
               "\t\t\tsourceTree = \"<group>\";\n"
               "\t\t}};".format(gid=ids["products_group"], pid=ids["product"]))

    root_group = oid("group:root")
    out.append("\t\t{gid} = {{\n"
               "\t\t\tisa = PBXGroup;\n"
               "\t\t\tchildren = (\n\t\t\t\t{app},\n\t\t\t\t{products},\n\t\t\t);\n"
               "\t\t\tsourceTree = \"<group>\";\n"
               "\t\t}};".format(gid=root_group, app=app_group,
                                products=ids["products_group"]))
    out.append("/* End PBXGroup section */")

    # PBXNativeTarget
    out.append("\n/* Begin PBXNativeTarget section */")
    out.append(
        "\t\t{tid} /* {app} */ = {{\n"
        "\t\t\tisa = PBXNativeTarget;\n"
        "\t\t\tbuildConfigurationList = {cfg};\n"
        "\t\t\tbuildPhases = (\n\t\t\t\t{src},\n\t\t\t\t{frm},\n\t\t\t\t{res},\n\t\t\t);\n"
        "\t\t\tbuildRules = (\n\t\t\t);\n"
        "\t\t\tdependencies = (\n\t\t\t);\n"
        "\t\t\tname = {app};\n"
        "\t\t\tproductName = {app};\n"
        "\t\t\tproductReference = {prod};\n"
        "\t\t\tproductType = \"com.apple.product-type.application\";\n"
        "\t\t}};".format(tid=ids["target"], app=PROJECT_NAME,
                         cfg=ids["target_config_list"],
                         src=ids["sources_phase"], frm=ids["frameworks_phase"],
                         res=ids["resources_phase"], prod=ids["product"]))
    out.append("/* End PBXNativeTarget section */")

    # PBXProject
    out.append("\n/* Begin PBXProject section */")
    out.append(
        "\t\t{pid} /* Project object */ = {{\n"
        "\t\t\tisa = PBXProject;\n"
        "\t\t\tattributes = {{\n"
        "\t\t\t\tBuildIndependentTargetsInParallel = 1;\n"
        "\t\t\t\tLastSwiftUpdateCheck = 1600;\n"
        "\t\t\t\tLastUpgradeCheck = 1600;\n"
        "\t\t\t\tTargetAttributes = {{\n"
        "\t\t\t\t\t{tid} = {{\n\t\t\t\t\t\tCreatedOnToolsVersion = 16.0;\n\t\t\t\t\t}};\n"
        "\t\t\t\t}};\n"
        "\t\t\t}};\n"
        "\t\t\tbuildConfigurationList = {cfg};\n"
        "\t\t\tdevelopmentRegion = en;\n"
        "\t\t\thasScannedForEncodings = 0;\n"
        "\t\t\tknownRegions = (\n\t\t\t\ten,\n\t\t\t\tBase,\n\t\t\t);\n"
        "\t\t\tmainGroup = {root};\n"
        "\t\t\tproductRefGroup = {products};\n"
        "\t\t\tprojectDirPath = \"\";\n"
        "\t\t\tprojectRoot = \"\";\n"
        "\t\t\ttargets = (\n\t\t\t\t{tid},\n\t\t\t);\n"
        "\t\t}};".format(pid=ids["project"], tid=ids["target"],
                         cfg=ids["project_config_list"], root=root_group,
                         products=ids["products_group"]))
    out.append("/* End PBXProject section */")

    # Phases
    def phase(name, isa, oid_key, files):
        entries = "\n".join(
            "\t\t\t\t%s /* %s */," % (oid("build:" + f), os.path.basename(f))
            for f in files)
        return ("\t\t{pid} /* {name} */ = {{\n"
                "\t\t\tisa = {isa};\n"
                "\t\t\tbuildActionMask = 2147483647;\n"
                "\t\t\tfiles = (\n{entries}\n\t\t\t);\n"
                "\t\t\trunOnlyForDeploymentPostprocessing = 0;\n"
                "\t\t}};".format(pid=ids[oid_key], name=name, isa=isa,
                                 entries=entries))

    out.append("\n/* Begin PBXSourcesBuildPhase section */")
    out.append(phase("Sources", "PBXSourcesBuildPhase", "sources_phase", sources))
    out.append("/* End PBXSourcesBuildPhase section */")

    out.append("\n/* Begin PBXResourcesBuildPhase section */")
    out.append(phase("Resources", "PBXResourcesBuildPhase", "resources_phase", resources))
    out.append("/* End PBXResourcesBuildPhase section */")

    out.append("\n/* Begin PBXFrameworksBuildPhase section */")
    out.append(phase("Frameworks", "PBXFrameworksBuildPhase", "frameworks_phase", []))
    out.append("/* End PBXFrameworksBuildPhase section */")

    # Build configurations
    project_common = {
        "ALWAYS_SEARCH_USER_PATHS": "NO",
        "CLANG_ENABLE_MODULES": "YES",
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "COPY_PHASE_STRIP": "NO",
        "ENABLE_STRICT_OBJC_MSGSEND": "YES",
        "GCC_C_LANGUAGE_STANDARD": "gnu17",
        "IPHONEOS_DEPLOYMENT_TARGET": DEPLOYMENT_TARGET,
        "SDKROOT": "iphoneos",
        "SWIFT_VERSION": SWIFT_VERSION,
    }
    project_debug = dict(project_common, **{
        "DEBUG_INFORMATION_FORMAT": "dwarf",
        "ENABLE_TESTABILITY": "YES",
        "GCC_OPTIMIZATION_LEVEL": "0",
        "ONLY_ACTIVE_ARCH": "YES",
        "SWIFT_ACTIVE_COMPILATION_CONDITIONS": "DEBUG",
        "SWIFT_OPTIMIZATION_LEVEL": "-Onone",
    })
    project_release = dict(project_common, **{
        "DEBUG_INFORMATION_FORMAT": "\"dwarf-with-dsym\"",
        "ENABLE_NS_ASSERTIONS": "NO",
        "SWIFT_COMPILATION_MODE": "wholemodule",
        "VALIDATE_PRODUCT": "YES",
    })
    team = development_team()
    target_common = {
        "ASSETCATALOG_COMPILER_APPICON_NAME": "AppIcon",
        "CODE_SIGN_STYLE": "Automatic",
        # Taken from Xcode's own accounts, so signing needs no visit to
        # Signing & Capabilities. DEVELOPMENT_TEAM=... overrides it.
        **({"DEVELOPMENT_TEAM": team} if team else {}),
        "CURRENT_PROJECT_VERSION": "1",
        "ENABLE_PREVIEWS": "YES",
        "GENERATE_INFOPLIST_FILE": "NO",
        "INFOPLIST_FILE": "\"%s/App/Info.plist\"" % SOURCE_DIR,
        "LD_RUNPATH_SEARCH_PATHS": "(\n\t\t\t\t\t\"$(inherited)\",\n\t\t\t\t\t\"@executable_path/Frameworks\",\n\t\t\t\t)",
        "MARKETING_VERSION": "1.0",
        "PRODUCT_BUNDLE_IDENTIFIER": BUNDLE_ID,
        "PRODUCT_NAME": "\"$(TARGET_NAME)\"",
        "SWIFT_EMIT_LOC_STRINGS": "YES",
        # 1,2 = iPhone and iPad. The UI adapts: iPad runs landscape with
        # side-by-side modules, iPhone runs portrait with them stacked.
        "TARGETED_DEVICE_FAMILY": '"1,2"',
    }

    def config(cid, name, settings):
        body = "\n".join("\t\t\t\t%s = %s;" % (k, v) for k, v in sorted(settings.items()))
        return ("\t\t{cid} /* {name} */ = {{\n"
                "\t\t\tisa = XCBuildConfiguration;\n"
                "\t\t\tbuildSettings = {{\n{body}\n\t\t\t}};\n"
                "\t\t\tname = {name};\n"
                "\t\t}};".format(cid=cid, name=name, body=body))

    out.append("\n/* Begin XCBuildConfiguration section */")
    out.append(config(ids["project_debug"], "Debug", project_debug))
    out.append(config(ids["project_release"], "Release", project_release))
    out.append(config(ids["target_debug"], "Debug", target_common))
    out.append(config(ids["target_release"], "Release", target_common))
    out.append("/* End XCBuildConfiguration section */")

    def config_list(lid, debug, release, name):
        return ("\t\t{lid} /* Build configuration list for {name} */ = {{\n"
                "\t\t\tisa = XCConfigurationList;\n"
                "\t\t\tbuildConfigurations = (\n\t\t\t\t{d},\n\t\t\t\t{r},\n\t\t\t);\n"
                "\t\t\tdefaultConfigurationIsVisible = 0;\n"
                "\t\t\tdefaultConfigurationName = Release;\n"
                "\t\t}};".format(lid=lid, d=debug, r=release, name=name))

    out.append("\n/* Begin XCConfigurationList section */")
    out.append(config_list(ids["project_config_list"], ids["project_debug"],
                           ids["project_release"], "PBXProject"))
    out.append(config_list(ids["target_config_list"], ids["target_debug"],
                           ids["target_release"], "PBXNativeTarget"))
    out.append("/* End XCConfigurationList section */")

    out.append("\t};")
    out.append("\trootObject = %s /* Project object */;" % ids["project"])
    out.append("}")

    # Write it out
    proj_dir = os.path.join(ROOT, "%s.xcodeproj" % PROJECT_NAME)
    if os.path.isdir(proj_dir):
        shutil.rmtree(proj_dir)
    scheme_dir = os.path.join(proj_dir, "xcshareddata", "xcschemes")
    os.makedirs(scheme_dir)

    with open(os.path.join(proj_dir, "project.pbxproj"), "w") as fh:
        fh.write("\n".join(out) + "\n")

    with open(os.path.join(scheme_dir, "%s.xcscheme" % PROJECT_NAME), "w") as fh:
        fh.write(SCHEME.format(app=PROJECT_NAME, target=ids["target"],
                               project=PROJECT_NAME, product=ids["product"]))

    print("Wrote %s.xcodeproj  (%d Swift files, %d resources)"
          % (PROJECT_NAME, len(sources), len(resources)))


SCHEME = """<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion = "1600" version = "1.7">
   <BuildAction parallelizeBuildables = "YES" buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry buildForTesting = "YES" buildForRunning = "YES" buildForProfiling = "YES" buildForArchiving = "YES" buildForAnalyzing = "YES">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "{target}"
               BuildableName = "{app}.app"
               BlueprintName = "{app}"
               ReferencedContainer = "container:{project}.xcodeproj">
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv = "YES">
      <Testables>
      </Testables>
   </TestAction>
   <LaunchAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" launchStyle = "0" useCustomWorkingDirectory = "NO" ignoresPersistentStateOnLaunch = "NO" debugDocumentVersioning = "YES" debugServiceExtension = "internal" allowLocationSimulation = "YES">
      <BuildableProductRunnable runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "{target}"
            BuildableName = "{app}.app"
            BlueprintName = "{app}"
            ReferencedContainer = "container:{project}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction buildConfiguration = "Release" shouldUseLaunchSchemeArgsEnv = "YES" savedToolIdentifier = "" useCustomWorkingDirectory = "NO" debugDocumentVersioning = "YES">
      <BuildableProductRunnable runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "{target}"
            BuildableName = "{app}.app"
            BlueprintName = "{app}"
            ReferencedContainer = "container:{project}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction buildConfiguration = "Debug"></AnalyzeAction>
   <ArchiveAction buildConfiguration = "Release" revealArchiveInOrganizer = "YES"></ArchiveAction>
</Scheme>
"""

if __name__ == "__main__":
    generate()
