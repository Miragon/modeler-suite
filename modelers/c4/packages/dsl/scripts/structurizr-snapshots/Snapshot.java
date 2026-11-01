import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.structurizr.Workspace;
import com.structurizr.dsl.StructurizrDslParser;
import com.structurizr.dsl.StructurizrDslParserException;
import com.structurizr.model.Component;
import com.structurizr.model.Container;
import com.structurizr.model.CustomElement;
import com.structurizr.model.Element;
import com.structurizr.model.GroupableElement;
import com.structurizr.model.Person;
import com.structurizr.model.Relationship;
import com.structurizr.model.SoftwareSystem;
import com.structurizr.view.AutomaticLayout;
import com.structurizr.view.ComponentView;
import com.structurizr.view.ContainerView;
import com.structurizr.view.ElementStyle;
import com.structurizr.view.ElementView;
import com.structurizr.view.ModelView;
import com.structurizr.view.RelationshipStyle;
import com.structurizr.view.RelationshipView;
import com.structurizr.view.StaticView;
import com.structurizr.view.SystemContextView;
import com.structurizr.view.SystemLandscapeView;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Pattern;

/**
 * What Structurizr 6.2.4 makes of a list of DSL files, as JSON on standard output.
 *
 * Usage: java Snapshot fixtures <source folder> <relative path>... (the fixture summary)
 *        java Snapshot edits <file>...                             (accepted or not, per text)
 *
 * The fixture summary keys elements and relationships by canonical name, since anonymous elements
 * get a random identifier from the reference parser. Only the static model is summarised: people,
 * software systems, containers, components, custom elements, the relationships between them and
 * the four static view types.
 */
public final class Snapshot {

    private static final Pattern UUID = Pattern.compile("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}");
    private static final String IDENTIFIER_PROPERTY = "structurizr.dsl.identifier";

    public static void main(String[] args) throws Exception {
        List<Object> results = new ArrayList<>();
        if (args.length > 1 && args[0].equals("fixtures")) {
            Path source = Path.of(args[1]);
            for (int index = 2; index < args.length; index++) {
                results.add(fixture(source, args[index]));
            }
        } else if (args.length > 0 && args[0].equals("edits")) {
            for (int index = 1; index < args.length; index++) {
                results.add(edit(Path.of(args[index])));
            }
        } else {
            System.err.println("usage: Snapshot fixtures <source> <file>... | Snapshot edits <file>...");
            System.exit(2);
        }
        ObjectMapper mapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
        System.out.println(mapper.writeValueAsString(results));
    }

    private static Map<String, Object> edit(Path file) throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        byte[] bytes = Files.readAllBytes(file);
        result.put("file", file.toString());
        result.put("sha256", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)));
        try {
            StructurizrDslParser parser = new StructurizrDslParser();
            parser.parse(new String(bytes, StandardCharsets.UTF_8));
            result.put("accepted", true);
        } catch (Exception e) {
            result.put("accepted", false);
            result.put("error", String.valueOf(e.getMessage()));
        }
        return result;
    }

    private static Map<String, Object> fixture(Path source, String relative) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("file", relative);
        File file = source.resolve(relative).toFile();
        StructurizrDslParser parser = new StructurizrDslParser();
        if (relative.contains("iso-8859")) {
            parser.setCharacterEncoding(StandardCharsets.ISO_8859_1);
        }
        try {
            parser.parse(file);
        } catch (StructurizrDslParserException e) {
            String message = firstLine(e.getMessage());
            int at = message.lastIndexOf(" at line " + e.getLineNumber());
            result.put("accepted", false);
            result.put("error", withoutPaths(at == -1 ? message : message.substring(0, at), source));
            result.put("line", e.getLineNumber());
            return result;
        } catch (Exception e) {
            result.put("accepted", false);
            result.put("error", withoutPaths(firstLine(String.valueOf(e.getMessage())), source));
            return result;
        }
        result.put("accepted", true);
        result.put("workspace", workspace(parser.getWorkspace()));
        return result;
    }

    /** Absolute paths differ per machine; the snapshot is checked in. */
    private static String withoutPaths(String message, Path source) {
        String folder = source.toAbsolutePath().normalize() + File.separator;
        String workingDirectory = Path.of("").toAbsolutePath() + File.separator;
        return message.replace(folder, "").replace(workingDirectory, "");
    }

    private static String firstLine(String message) {
        int newline = message.indexOf('\n');
        return newline == -1 ? message : message.substring(0, newline);
    }

    private static Map<String, Object> workspace(Workspace workspace) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("name", workspace.getName());
        summary.put("description", workspace.getDescription());
        List<Element> elements = workspace.getModel().getElements().stream()
                .filter(Snapshot::isStatic)
                .sorted(Comparator.comparingLong(element -> Long.parseLong(element.getId())))
                .toList();
        List<Object> elementSummaries = new ArrayList<>();
        for (Element element : elements) {
            elementSummaries.add(element(element));
        }
        summary.put("elements", elementSummaries);
        List<Relationship> relationships = workspace.getModel().getRelationships().stream()
                .filter(relationship -> isStatic(relationship.getSource()) && isStatic(relationship.getDestination()))
                .sorted(Comparator.comparingLong(relationship -> Long.parseLong(relationship.getId())))
                .toList();
        List<Object> relationshipSummaries = new ArrayList<>();
        for (Relationship relationship : relationships) {
            relationshipSummaries.add(relationship(relationship));
        }
        summary.put("relationships", relationshipSummaries);
        List<Object> views = new ArrayList<>();
        String defaultView = workspace.getViews().getConfiguration().getDefaultView();
        for (StaticView view : staticViews(workspace)) {
            views.add(view(view, defaultView));
        }
        summary.put("views", views);
        summary.put("styles", styles(workspace));
        return summary;
    }

    private static List<StaticView> staticViews(Workspace workspace) {
        List<StaticView> views = new ArrayList<>();
        views.addAll(workspace.getViews().getSystemLandscapeViews());
        views.addAll(workspace.getViews().getSystemContextViews());
        views.addAll(workspace.getViews().getContainerViews());
        views.addAll(workspace.getViews().getComponentViews());
        views.sort(Comparator.comparingInt(ModelView::getOrder));
        return views;
    }

    private static boolean isStatic(Element element) {
        return element instanceof Person || element instanceof SoftwareSystem || element instanceof Container
                || element instanceof Component || element instanceof CustomElement;
    }

    private static String kind(Element element) {
        if (element instanceof Person) return "person";
        if (element instanceof SoftwareSystem) return "softwareSystem";
        if (element instanceof Container) return "container";
        if (element instanceof Component) return "component";
        return "custom";
    }

    private static Map<String, Object> element(Element element) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("canonical", element.getCanonicalName());
        String identifier = element.getProperties().get(IDENTIFIER_PROPERTY);
        summary.put("identifier", identifier == null || UUID.matcher(identifier).find() ? null : identifier);
        summary.put("kind", kind(element));
        summary.put("parent", element.getParent() == null ? null : element.getParent().getCanonicalName());
        summary.put("name", element.getName());
        summary.put("description", nullToEmpty(element.getDescription()));
        if (element instanceof Container container) summary.put("technology", nullToEmpty(container.getTechnology()));
        else if (element instanceof Component component) summary.put("technology", nullToEmpty(component.getTechnology()));
        else summary.put("technology", "");
        summary.put("metadata", element instanceof CustomElement custom ? nullToEmpty(custom.getMetadata()) : "");
        summary.put("tags", new ArrayList<>(element.getTagsAsSet()));
        summary.put("url", element.getUrl());
        summary.put("group", element instanceof GroupableElement groupable ? groupable.getGroup() : null);
        summary.put("properties", properties(element.getProperties()));
        return summary;
    }

    private static Map<String, Object> relationship(Relationship relationship) {
        Map<String, Object> summary = new LinkedHashMap<>();
        String identifier = relationship.getProperties().get(IDENTIFIER_PROPERTY);
        summary.put("identifier", identifier == null || UUID.matcher(identifier).find() ? null : identifier);
        summary.put("source", relationship.getSource().getCanonicalName());
        summary.put("destination", relationship.getDestination().getCanonicalName());
        summary.put("description", nullToEmpty(relationship.getDescription()));
        summary.put("technology", nullToEmpty(relationship.getTechnology()));
        summary.put("tags", new ArrayList<>(relationship.getTagsAsSet()));
        summary.put("url", relationship.getUrl());
        summary.put("implied", relationship.getLinkedRelationshipId() != null);
        summary.put("properties", properties(relationship.getProperties()));
        return summary;
    }

    private static Map<String, Object> view(StaticView view, String defaultView) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("key", view.getKey());
        summary.put("type", viewType(view));
        summary.put("scope", scopeOf(view));
        summary.put("title", view.getTitle());
        summary.put("description", view.getDescription());
        summary.put("default", view.getKey().equals(defaultView));
        summary.put("autoLayout", autoLayout(view.getAutomaticLayout()));
        List<String> elements = new ArrayList<>();
        for (ElementView elementView : view.getElements()) {
            elements.add(elementView.getElement().getCanonicalName());
        }
        elements.sort(Comparator.naturalOrder());
        summary.put("elements", elements);
        List<String> relationships = new ArrayList<>();
        for (RelationshipView relationshipView : view.getRelationships()) {
            Relationship relationship = relationshipView.getRelationship();
            relationships.add(relationship.getSource().getCanonicalName() + " -> "
                    + relationship.getDestination().getCanonicalName() + " (" + nullToEmpty(relationship.getDescription()) + ")"
                    + (relationship.getLinkedRelationshipId() == null ? "" : " implied"));
        }
        relationships.sort(Comparator.naturalOrder());
        summary.put("relationships", relationships);
        summary.put("properties", properties(view.getProperties()));
        return summary;
    }

    private static String viewType(StaticView view) {
        if (view instanceof SystemLandscapeView) return "systemLandscape";
        if (view instanceof SystemContextView) return "systemContext";
        if (view instanceof ContainerView) return "container";
        return "component";
    }

    private static String scopeOf(StaticView view) {
        if (view instanceof SystemContextView context) return context.getSoftwareSystem().getCanonicalName();
        if (view instanceof ContainerView container) return container.getSoftwareSystem().getCanonicalName();
        if (view instanceof ComponentView component) return component.getContainer().getCanonicalName();
        return null;
    }

    private static Map<String, Object> autoLayout(AutomaticLayout layout) {
        if (layout == null) return null;
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("rankDirection", String.valueOf(layout.getRankDirection()));
        summary.put("rankSeparation", layout.getRankSeparation());
        summary.put("nodeSeparation", layout.getNodeSeparation());
        summary.put("edgeSeparation", layout.getEdgeSeparation());
        summary.put("vertices", layout.isVertices());
        return summary;
    }

    private static Map<String, Object> styles(Workspace workspace) {
        Map<String, Object> summary = new LinkedHashMap<>();
        List<Object> elements = new ArrayList<>();
        for (ElementStyle style : workspace.getViews().getConfiguration().getStyles().getElements()) {
            if (style.getColorScheme() != null && !"Light".equals(String.valueOf(style.getColorScheme()))) continue;
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("tag", style.getTag());
            entry.put("shape", style.getShape() == null ? null : String.valueOf(style.getShape()));
            entry.put("background", style.getBackground());
            entry.put("color", style.getColor());
            entry.put("stroke", style.getStroke());
            entry.put("width", style.getWidth());
            entry.put("height", style.getHeight());
            entry.put("border", style.getBorder() == null ? null : String.valueOf(style.getBorder()));
            entry.put("opacity", style.getOpacity());
            entry.put("strokeWidth", style.getStrokeWidth());
            entry.put("fontSize", style.getFontSize());
            entry.put("metadata", style.getMetadata());
            entry.put("description", style.getDescription());
            elements.add(entry);
        }
        summary.put("elements", elements);
        List<Object> relationships = new ArrayList<>();
        for (RelationshipStyle style : workspace.getViews().getConfiguration().getStyles().getRelationships()) {
            if (style.getColorScheme() != null && !"Light".equals(String.valueOf(style.getColorScheme()))) continue;
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("tag", style.getTag());
            entry.put("thickness", style.getThickness());
            entry.put("color", style.getColor());
            entry.put("style", style.getStyle() == null ? null : String.valueOf(style.getStyle()));
            entry.put("dashed", style.getDashed());
            entry.put("routing", style.getRouting() == null ? null : String.valueOf(style.getRouting()));
            entry.put("fontSize", style.getFontSize());
            entry.put("width", style.getWidth());
            entry.put("position", style.getPosition());
            entry.put("opacity", style.getOpacity());
            relationships.add(entry);
        }
        summary.put("relationships", relationships);
        summary.put("themes", workspace.getViews().getConfiguration().getThemes() == null
                ? List.of() : List.of(workspace.getViews().getConfiguration().getThemes()));
        return summary;
    }

    private static Map<String, String> properties(Map<String, String> properties) {
        Map<String, String> sorted = new TreeMap<>(properties);
        sorted.remove(IDENTIFIER_PROPERTY);
        return sorted;
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
