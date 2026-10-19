import PageLoader from "@/components/layout/page-loader";

/**
 * Streamed in the instant a navigation starts, before the page's data has
 * arrived: the Signature sphere with its lights running around it, under a
 * header the height of the page's own (page-loader.jsx). The pages one level
 * down (a lead, a project, a client, a call list, a notification, a report)
 * have their own copy of this file, so opening one from its list shows it
 * too, rather than the list staying put until the page arrives.
 */
export default function Loading() {
  return <PageLoader />;
}
